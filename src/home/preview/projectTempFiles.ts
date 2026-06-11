import type { FileSystemTree } from '@webcontainer/api'

/** projectTemp 模板根目录在 glob 中的前缀 */
const PROJECT_TEMP_PREFIX = '../../a_template/projectTemp/'

/** 不挂载到 WebContainer 的文件或目录 */
const EXCLUDED_PATHS = [
  '.vscode/',
  '.gitignore',
  'README.md',
  'public/favicon.ico',
  'pnpm-lock.yaml',
]

/** 预加载 projectTemp 下的文本文件 */
const rawModules = import.meta.glob('../../a_template/projectTemp/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

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

  console.log('current', current)
}

/**
 * 构建 projectTemp 模板的 WebContainer 文件树
 */
export function buildProjectTempFileTree(): FileSystemTree {
  const tree: FileSystemTree = {}

  for (const [fullPath, contents] of Object.entries(rawModules)) {
    if (!fullPath.startsWith(PROJECT_TEMP_PREFIX)) continue

    const relativePath = fullPath.slice(PROJECT_TEMP_PREFIX.length)
    if (!relativePath || EXCLUDED_PATHS.some((item) => relativePath.includes(item))) {
      continue
    }

    setFileInTree(tree, relativePath, contents)
  }

  return tree
}
