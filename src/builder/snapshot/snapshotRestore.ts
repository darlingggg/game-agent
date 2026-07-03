import { normalizeRelativePath, saveProjectTempFileContent } from '@/builder/file/projectTempFiles'
import { syncSnapshotRestoreToPreview } from '@/builder/preview/previewSync'
import { deleteFile, getFileStat, type ProjectTempFileItem } from '@/http/file'
import { updateProject } from '@/http/project'
import type { snapshotItem } from '@/http/snapshot'
import { toProjectRelativePath } from './snapshotFileTree'

/** 还原变更类型 */
export type SnapshotRestoreChangeType = 'unchanged' | 'added' | 'deleted' | 'overwritten'

/** 文件 meta 信息 */
interface FileMeta {
  /** 文件字节数 */
  bytes: number
  /** 文件行数 */
  length: number
}

/** 单文件还原变更项 */
export interface SnapshotRestoreFileChange {
  /** 相对项目根目录的路径 */
  relativePath: string
  /** 变更类型 */
  type: SnapshotRestoreChangeType
  /** 当前文件行数 */
  currentLines?: number
  /** 目标快照行数 */
  targetLines?: number
  /** 当前文件字节数 */
  currentBytes?: number
  /** 目标快照字节数 */
  targetBytes?: number
  /** 快照文件内容（新增/覆盖时写入） */
  snapshotContent?: string
  /** 当前文件绝对路径（删除时使用） */
  currentAbsolutePath?: string
}

/** 版本还原计划 */
export interface SnapshotRestorePlan {
  /** 目标版本号 */
  version: string
  /** 快照创建时的模板版本号 */
  tempVersion: string
  /** 不变文件 */
  unchanged: SnapshotRestoreFileChange[]
  /** 新增文件 */
  added: SnapshotRestoreFileChange[]
  /** 删除文件 */
  deleted: SnapshotRestoreFileChange[]
  /** 覆盖文件 */
  overwritten: SnapshotRestoreFileChange[]
}

/** 版本还原时需同步的项目信息 */
export interface SnapshotRestoreProjectUpdate {
  /** 项目 id */
  id: number
  /** 项目标题 */
  title: string
  /** 项目描述 */
  desc?: string
}

/** 项目文件变更事件名，文件面板监听后刷新列表 */
export const PROJECT_FILES_CHANGED_EVENT = 'project-files-changed'

/**
 * 计算文件行数（与后端快照保存逻辑一致）
 * @param content 文件内容
 */
export function getFileLineCount(content: string): number {
  return content === '' ? 0 : content.split(/\r?\n/).length
}

/**
 * 判断两边文件的 bytes/length 是否一致
 * @param currentMeta 当前文件 meta
 * @param snapshotBytes 快照 bytes
 * @param snapshotLines 快照行数
 */
export function isSnapshotFileMetaEqual(
  currentMeta: FileMeta,
  snapshotBytes: number,
  snapshotLines: number,
): boolean {
  return currentMeta.bytes === Number(snapshotBytes) && currentMeta.length === Number(snapshotLines)
}

/**
 * 还原变更差值展示数据
 */
export interface SnapshotLineChangeDisplay {
  /** 变更前值 */
  fromValue: number
  /** 变更后值 */
  toValue: number
  /** 值单位 */
  unit: 'line' | 'byte'
  /** 差值，正数为增加，负数为减少 */
  diff: number
}

/**
 * 构建覆盖文件的行数/字节变化展示数据
 * @param currentLines 当前行数
 * @param targetLines 目标行数
 * @param currentBytes 当前字节数
 * @param targetBytes 目标字节数
 */
export function buildLineChangeDisplay(
  currentLines: number,
  targetLines: number,
  currentBytes?: number,
  targetBytes?: number,
): SnapshotLineChangeDisplay {
  const lineDiff = targetLines - currentLines

  if (lineDiff !== 0) {
    return {
      fromValue: currentLines,
      toValue: targetLines,
      unit: 'line',
      diff: lineDiff,
    }
  }

  if (
    currentBytes !== undefined
    && targetBytes !== undefined
    && currentBytes !== targetBytes
  ) {
    return {
      fromValue: currentBytes,
      toValue: targetBytes,
      unit: 'byte',
      diff: targetBytes - currentBytes,
    }
  }

  return {
    fromValue: currentLines,
    toValue: targetLines,
    unit: 'line',
    diff: 0,
  }
}

/**
 * 判断还原计划是否包含实际变更
 * @param plan 还原计划
 */
export function hasSnapshotRestoreChanges(plan: SnapshotRestorePlan): boolean {
  return plan.added.length > 0 || plan.deleted.length > 0 || plan.overwritten.length > 0
}

/**
 * 获取当前文件 meta（优先用列表接口返回的 bytes/length，否则请求 stat 接口）
 * @param currentFile 当前文件项
 * @param projectDirPath 项目根目录绝对路径
 */
async function resolveCurrentFileMeta(
  currentFile: ProjectTempFileItem,
  projectDirPath: string,
): Promise<FileMeta> {
  if (currentFile.bytes != null && currentFile.length != null) {
    return {
      bytes: Number(currentFile.bytes),
      length: Number(currentFile.length),
    }
  }

  const stat = await getFileStat({
    dir: projectDirPath,
    path: normalizeRelativePath(currentFile.relativePath),
  })

  return {
    bytes: Number(stat.bytes),
    length: Number(stat.length),
  }
}

/**
 * 批量解析需要比对的当前项目文件 meta
 * @param relativePaths 需要比对的相对路径列表
 * @param currentMap 当前项目文件映射
 * @param projectDirPath 项目根目录绝对路径
 */
async function resolveCurrentFilesMetaMap(
  relativePaths: string[],
  currentMap: Map<string, ProjectTempFileItem>,
  projectDirPath: string,
): Promise<Map<string, FileMeta>> {
  const metaMap = new Map<string, FileMeta>()

  await Promise.all(
    relativePaths.map(async (relativePath) => {
      const currentFile = currentMap.get(relativePath)
      if (!currentFile) return
      metaMap.set(relativePath, await resolveCurrentFileMeta(currentFile, projectDirPath))
    }),
  )

  return metaMap
}

/**
 * 构建版本还原计划：比对快照版本与当前项目目录差异（仅比对 bytes/length，不读文件内容）
 * @param version 目标版本号
 * @param snapshotFiles 快照版本文件列表（含内容，内容仅用于最终写入）
 * @param currentFiles 当前项目文件列表
 * @param projectDirPath 项目根目录绝对路径
 */
export async function buildSnapshotRestorePlan(
  version: string,
  snapshotFiles: snapshotItem[],
  currentFiles: ProjectTempFileItem[],
  projectDirPath: string,
): Promise<SnapshotRestorePlan> {
  const plan: SnapshotRestorePlan = {
    version,
    tempVersion: snapshotFiles[0]?.tempVersion?.trim() ?? '',
    unchanged: [],
    added: [],
    deleted: [],
    overwritten: [],
  }

  const currentMap = new Map<string, ProjectTempFileItem>()
  for (const file of currentFiles) {
    currentMap.set(normalizeRelativePath(file.relativePath), file)
  }

  const snapshotMap = new Map<string, snapshotItem>()
  for (const file of snapshotFiles) {
    const relativePath = normalizeRelativePath(toProjectRelativePath(file.filePath, projectDirPath))
    if (!relativePath) continue
    snapshotMap.set(relativePath, file)
  }

  const currentMetaMap = await resolveCurrentFilesMetaMap(
    [...snapshotMap.keys()].filter((path) => currentMap.has(path)),
    currentMap,
    projectDirPath,
  )

  // 快照有、当前无 → 新增；两边都有 → 比对 bytes/length
  for (const [relativePath, snapshotFile] of snapshotMap) {
    const currentFile = currentMap.get(relativePath)
    const snapshotLines = Number(snapshotFile.length)

    if (!currentFile) {
      plan.added.push({
        relativePath,
        type: 'added',
        targetLines: snapshotLines,
        snapshotContent: snapshotFile.fileContent,
      })
      continue
    }

    const currentMeta = currentMetaMap.get(relativePath)
    if (!currentMeta) continue

    if (isSnapshotFileMetaEqual(currentMeta, snapshotFile.bytes, snapshotFile.length)) {
      plan.unchanged.push({
        relativePath,
        type: 'unchanged',
        currentLines: currentMeta.length,
        targetLines: snapshotLines,
      })
      continue
    }

    plan.overwritten.push({
      relativePath,
      type: 'overwritten',
      currentLines: currentMeta.length,
      targetLines: snapshotLines,
      currentBytes: currentMeta.bytes,
      targetBytes: Number(snapshotFile.bytes),
      snapshotContent: snapshotFile.fileContent,
    })
  }

  // 当前有、快照无 → 删除
  for (const [relativePath, currentFile] of currentMap) {
    if (snapshotMap.has(relativePath)) continue
    plan.deleted.push({
      relativePath,
      type: 'deleted',
      currentAbsolutePath: currentFile.path,
    })
  }

  return plan
}

/**
 * 执行版本还原：删除多余文件，写入新增与覆盖文件，并同步项目模板版本
 * @param plan 还原计划
 * @param projectDirPath 项目根目录绝对路径
 * @param projectUpdate 项目信息（title、desc 保持不变，仅更新 tempVersion）
 */
export async function executeSnapshotRestore(
  plan: SnapshotRestorePlan,
  projectDirPath: string,
  projectUpdate: SnapshotRestoreProjectUpdate,
): Promise<void> {
  for (const item of plan.deleted) {
    if (!item.currentAbsolutePath) continue
    await deleteFile({ dir: projectDirPath, path: item.currentAbsolutePath })
  }

  const toWrite = [...plan.added, ...plan.overwritten]
  for (const item of toWrite) {
    if (item.snapshotContent === undefined) continue
    await saveProjectTempFileContent(item.relativePath, item.snapshotContent)
  }

  await updateProject({
    id: projectUpdate.id,
    title: projectUpdate.title,
    desc: projectUpdate.desc,
    tempVersion: plan.tempVersion || undefined,
  })

  await syncSnapshotRestoreToPreview(plan)

  window.dispatchEvent(new CustomEvent(PROJECT_FILES_CHANGED_EVENT))
}
