import { fetchProjectTempFileContent, normalizeRelativePath } from '../file/projectTempFiles'
import { syncPreviewFile } from './webcontainer'

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
