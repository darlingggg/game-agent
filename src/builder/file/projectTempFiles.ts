import {
  getFileContent,
  getFileList,
  PROJECT_TEMP_DIR,
  type ProjectTempFileItem,
  writeFileContent,
} from '@/http/file'

export { PROJECT_TEMP_DIR, type ProjectTempFileItem }

/** 文本预览最大字节数，超出则拒绝加载避免 Monaco 卡死 */
const MAX_PREVIEW_BYTES = 512 * 1024

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

/**
 * 将 Windows 路径分隔符统一为 /
 * @param relativePath 相对路径
 */
export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
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

/**
 * 获取 projectTemp 文件列表
 */
export async function fetchProjectTempFileList(): Promise<ProjectTempFileItem[]> {
  const list = await getFileList({ dir: PROJECT_TEMP_DIR })
  return list.map((item) => ({
    ...item,
    relativePath: normalizeRelativePath(item.relativePath),
  }))
}

/**
 * 获取指定文件内容
 * @param relativePath 相对 projectTemp 根目录的路径
 */
export async function fetchProjectTempFileContent(relativePath: string): Promise<string> {
  const content = await getFileContent({
    dir: PROJECT_TEMP_DIR,
    path: relativePath,
  })

  if (typeof content !== 'string') {
    throw new Error('文件内容格式异常')
  }

  // 过大文件会导致 Monaco 阻塞主线程，直接拒绝预览
  if (content.length > MAX_PREVIEW_BYTES) {
    throw new Error('文件过大，暂不支持预览')
  }

  return content
}

/**
 * 保存指定文件内容
 * @param relativePath 相对 projectTemp 根目录的路径
 * @param content 修改后的文件内容
 */
export async function saveProjectTempFileContent(
  relativePath: string,
  content: string,
): Promise<void> {
  await writeFileContent({
    dir: PROJECT_TEMP_DIR,
    path: relativePath,
    content,
  })
}

/**
 * 从文件列表构建文件树
 * @param files 文件列表
 */
export function buildProjectTempFileTree(files: ProjectTempFileItem[]): FileTreeNode {
  const root: FileTreeNode = {
    name: 'projectTemp',
    path: '',
    type: 'directory',
    children: [],
  }

  files.forEach((file) => {
    const relativePath = normalizeRelativePath(file.relativePath)
    const extension = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase()
    if (BINARY_FILE_EXTENSIONS.has(extension)) return
    insertPath(root, relativePath)
  })

  if (root.children) {
    sortTreeNodes(root.children)
  }

  return root
}

/**
 * 加载 projectTemp 文件树
 */
export async function loadProjectTempFileTree(): Promise<FileTreeNode> {
  const files = await fetchProjectTempFileList()
  return buildProjectTempFileTree(files)
}
