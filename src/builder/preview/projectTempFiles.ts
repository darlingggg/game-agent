import type { FileSystemTree } from '@webcontainer/api'
import {
  fetchProjectTempFileContent,
  fetchProjectTempFileList,
  normalizeRelativePath,
} from '../file/projectTempFiles'

/** 不挂载到 WebContainer 的文件或目录 */
const EXCLUDED_PATHS = [
  '.vscode/',
  '.gitignore',
  'README.md',
  'public/favicon.ico',
]

/**
 * 将扁平路径写入 WebContainer 文件树
 * @param tree 目标文件树
 * @param relativePath 相对 projectTemp 的路径
 * @param contents 文件内容
 */
function setFileInTree(tree: FileSystemTree, relativePath: string, contents: string) {
  const parts = relativePath.split('/').filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) return

  let current = tree
  for (const part of parts) {
    const node = current[part]
    if (!node || !('directory' in node)) {
      current[part] = { directory: {} }
    }
    current = (current[part] as { directory: FileSystemTree }).directory
  }

  current[fileName] = {
    file: { contents },
  }
}

/**
 * 构建 projectTemp 模板的 WebContainer 文件树
 */
export async function buildProjectTempFileTree(): Promise<FileSystemTree> {
  const tree: FileSystemTree = {}
  const files = await fetchProjectTempFileList()

  for (const file of files) {
    const relativePath = normalizeRelativePath(file.relativePath)
    if (!relativePath || EXCLUDED_PATHS.some((item) => relativePath.includes(item))) {
      continue
    }

    try {
      const contents = await fetchProjectTempFileContent(relativePath)
      setFileInTree(tree, relativePath, contents)
    } catch (error) {
      // 单个文件读取失败时跳过，避免阻断整个预览流程
      console.warn(`跳过无法读取的文件: ${relativePath}`, error)
    }
  }

  return tree
}
