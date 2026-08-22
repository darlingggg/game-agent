import { fetchProjectTempFileContent, fetchProjectTempFileContents, normalizeRelativePath } from '../file/projectTempFiles'
import type { SnapshotRestorePlan } from '../snapshot/snapshotRestore'
import { previewIframeReloadSignal, refreshProjectTempPreview, removePreviewFile, requestPreviewIframeReloadDebounced, syncPreviewFile } from './webcontainer'

/** write_file_content 工具参数结构 */
interface WriteFileContentParams {
  path?: string
  relativePath?: string
  filePath?: string
  content?: string
  fileContent?: string
}

/** 文件删除类工具参数结构（delete_file） */
interface FileDeleteToolParams {
  path?: string
  relativePath?: string
  filePath?: string
}

/** upsert_file 工具返回的 data 项 */
interface UpsertFileResultItem {
  path?: string
  relativePath?: string
  action?: string
}

/** upsert_file 工具返回结构 */
interface UpsertFileResult {
  success?: boolean
  data?: UpsertFileResultItem[]
}

interface DownloadFileResult {
  success?: boolean
  data?: {
    relativePath?: string
  }
}

/** write_file_content 工具名称 */
export const WRITE_FILE_CONTENT_TOOL = 'write_file_content'

/** upsert_file 工具名称 */
export const UPSERT_FILE_TOOL = 'upsert_file'

/** delete_file 工具名称 */
export const DELETE_FILE_TOOL = 'delete_file'

/** download_file 工具名称 */
export const DOWNLOAD_FILE_TOOL = 'download_file'

/**
 * 从文件工具参数中解析相对路径
 * @param paramsJson 工具参数 JSON 字符串
 */
function parseFileToolPath(paramsJson: string): string | null {
  try {
    const params = JSON.parse(paramsJson) as WriteFileContentParams | FileDeleteToolParams
    const rawPath = params.relativePath ?? params.path ?? params.filePath
    if (!rawPath || typeof rawPath !== 'string') return null
    return normalizeRelativePath(rawPath)
  } catch {
    return null
  }
}

/**
 * 从 write_file_content 参数中解析文件内容
 * @param paramsJson 工具参数 JSON 字符串
 */
function parseWriteFileContent(paramsJson: string): string | null {
  try {
    const params = JSON.parse(paramsJson) as WriteFileContentParams
    const content = params.content ?? params.fileContent
    if (typeof content !== 'string') return null
    return content
  } catch {
    return null
  }
}

/**
 * 从 upsert_file 返回结果中解析相对路径列表
 * @param resultJson 工具结果 JSON 字符串
 */
function parseUpsertFileRelativePaths(resultJson: string): string[] {
  try {
    const result = JSON.parse(resultJson) as UpsertFileResult
    if (!Array.isArray(result.data)) return []
    const paths: string[] = []
    for (const item of result.data) {
      if (!item.relativePath || typeof item.relativePath !== 'string') continue
      paths.push(normalizeRelativePath(item.relativePath))
    }
    return paths
  } catch {
    return []
  }
}

function parseDownloadFileRelativePath(resultJson: string): string | null {
  try {
    const result = JSON.parse(resultJson) as DownloadFileResult
    const relativePath = result.data?.relativePath
    return typeof relativePath === 'string' && relativePath ? normalizeRelativePath(relativePath) : null
  } catch {
    return null
  }
}

/**
 * write_file_content 执行成功后，将文件同步到 WebContainer 触发预览热更新
 * @param paramsJson tool_start 阶段记录的参数 JSON
 */
export async function syncWriteFileContentToPreview(paramsJson: string): Promise<void> {
  const relativePath = parseFileToolPath(paramsJson)
  if (!relativePath) return

  let content = parseWriteFileContent(paramsJson)
  // 参数中无内容时，从后端读取刚写入的文件
  if (content === null) {
    try {
      content = await fetchProjectTempFileContent(relativePath)
    } catch {
      return
    }
  }

  await syncPreviewFile(relativePath, content)
}

/**
 * upsert_file 执行成功后，按结果中的 relativePath 从 /file/content 拉取完整内容并同步到 WebContainer
 * （参数里是 patch，不能当作文件内容）
 * @param resultJson tool_end 阶段记录的结果 JSON
 */
export async function syncUpsertFileToPreview(resultJson: string): Promise<void> {
  const relativePaths = parseUpsertFileRelativePaths(resultJson)
  if (relativePaths.length === 0) return

  for (const relativePath of relativePaths) {
    try {
      const content = await fetchProjectTempFileContent(relativePath)
      await syncPreviewFile(relativePath, content)
    } catch (error) {
      console.warn('[Preview] upsert_file 同步失败', relativePath, error)
    }
  }
}

/**
 * download_file 成功后按原始字节同步到 WebContainer，并通知文件树刷新。
 * @param resultJson 工具返回 JSON
 */
export async function syncDownloadedFileToPreview(resultJson: string): Promise<void> {
  const relativePath = parseDownloadFileRelativePath(resultJson)
  if (!relativePath) return

  const contents = await fetchProjectTempFileContents(relativePath)
  await syncPreviewFile(relativePath, contents)
  requestPreviewIframeReloadDebounced()
  window.dispatchEvent(new CustomEvent('project-files-changed', {
    detail: { previewAlreadySynced: true },
  }))
}

/**
 * delete_file 执行成功后，从 WebContainer 删除对应文件并刷新预览
 * @param paramsJson tool_start 阶段记录的参数 JSON
 */
export async function syncDeleteFileToPreview(paramsJson: string): Promise<void> {
  const relativePath = parseFileToolPath(paramsJson)
  if (!relativePath) return

  await removePreviewFile(relativePath)
  requestPreviewIframeReloadDebounced()
}

/**
 * 版本还原完成后，将变更同步到 WebContainer 预览环境
 * @param plan 还原计划
 */
export async function syncSnapshotRestoreToPreview(plan: SnapshotRestorePlan): Promise<void> {
  for (const item of plan.deleted) {
    await removePreviewFile(item.relativePath)
  }

  for (const item of [...plan.added, ...plan.overwritten]) {
    if (item.snapshotContent === undefined) continue
    await syncPreviewFile(item.relativePath, item.snapshotContent)
  }

  if (plan.deleted.length > 0 || plan.added.length > 0 || plan.overwritten.length > 0) {
    requestPreviewIframeReloadDebounced()
  }
}

/**
 * 模板升级完成后，重新挂载 projectTemp 文件并刷新预览 iframe
 */
export async function syncTemplateUpgradeToPreview(): Promise<void> {
  await refreshProjectTempPreview()
  previewIframeReloadSignal.value += 1
}
