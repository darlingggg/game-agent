import { fetchProjectTempFileContent, normalizeRelativePath } from '../file/projectTempFiles'
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

/** write_file_content 工具名称 */
export const WRITE_FILE_CONTENT_TOOL = 'write_file_content'

/**
 * 从 write_file_content 参数中解析相对路径
 * @param paramsJson 工具参数 JSON 字符串
 */
function parseWriteFilePath(paramsJson: string): string | null {
  try {
    const params = JSON.parse(paramsJson) as WriteFileContentParams
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
 * write_file_content 工具执行成功后，将文件同步到 WebContainer 触发预览热更新
 * @param paramsJson tool_start 阶段记录的参数 JSON
 */
export async function syncWriteFileContentToPreview(paramsJson: string): Promise<void> {
  const relativePath = parseWriteFilePath(paramsJson)
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
