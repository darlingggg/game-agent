/** 项目模板根目录标识 */
export const PROJECT_TEMP_ROOT = 'a_template/projectTemp'

/** 不支持文本预览的二进制文件后缀 */
const BINARY_FILE_EXTENSIONS = new Set([
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.woff',
  '.woff2',
])

/** 文件树节点类型 */
export type FileTreeNodeType = 'file' | 'directory'

/** 文件树节点 */
export interface FileTreeNode {
  /** 节点名称 */
  name: string
  /** 相对 projectTemp 根目录的路径 */
  path: string
  /** 节点类型 */
  type: FileTreeNodeType
  /** 子节点，仅目录存在 */
  children?: FileTreeNode[]
}

/** 通过 Vite 预加载 projectTemp 目录下的文本文件内容 */
const rawFileModules = import.meta.glob('../../a_template/projectTemp/**/*', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/**
 * 从 glob 路径中提取相对路径
 * @param modulePath Vite glob 返回的模块路径
 */
function toRelativePath(modulePath: string): string {
  const marker = '../a_template/projectTemp/'
  const index = modulePath.indexOf(marker)
  if (index === -1) return modulePath
  return modulePath.slice(index + marker.length)
}

/**
 * 向目录节点中插入文件路径
 * @param root 根节点
 * @param relativePath 相对路径
 */
function insertPath(root: FileTreeNode, relativePath: string) {
  const segments = relativePath.split('/')
  let current = root

  segments.forEach((segment, index) => {
    const isFile = index === segments.length - 1
    const currentPath = segments.slice(0, index + 1).join('/')

    if (isFile) {
      current.children = current.children ?? []
      const exists = current.children.some((item) => item.path === currentPath)
      if (!exists) {
        current.children.push({
          name: segment,
          path: currentPath,
          type: 'file',
        })
      }
      return
    }

    current.children = current.children ?? []
    let directory = current.children.find(
      (item) => item.type === 'directory' && item.name === segment,
    )

    if (!directory) {
      directory = {
        name: segment,
        path: currentPath,
        type: 'directory',
        children: [],
      }
      current.children.push(directory)
    }

    current = directory
  })
}

/**
 * 对文件树节点排序：目录在前，文件在后，同类型按名称排序
 * @param nodes 待排序节点列表
 */
function sortTreeNodes(nodes: FileTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  nodes.forEach((node) => {
    if (node.children?.length) {
      sortTreeNodes(node.children)
    }
  })
}

/** projectTemp 文件树 */
export const projectTempFileTree: FileTreeNode = (() => {
  const root: FileTreeNode = {
    name: 'projectTemp',
    path: '',
    type: 'directory',
    children: [],
  }

  Object.keys(rawFileModules).forEach((modulePath) => {
    const relativePath = toRelativePath(modulePath)
    const extension = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase()
    if (BINARY_FILE_EXTENSIONS.has(extension)) return
    insertPath(root, relativePath)
  })

  if (root.children) {
    sortTreeNodes(root.children)
  }

  return root
})()

/** 文件路径到内容的映射 */
export const projectTempFileContents: Record<string, string> = Object.fromEntries(
  Object.entries(rawFileModules).map(([modulePath, content]) => [
    toRelativePath(modulePath),
    content,
  ]),
)
