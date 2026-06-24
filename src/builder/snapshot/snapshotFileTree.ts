import type { snapshotItem } from '@/http/snapshot'

/** 快照文件项（不含 fileContent） */
export type SnapshotFileItem = Omit<snapshotItem, 'fileContent'>

/** 快照文件树节点类型 */
export type SnapshotFileTreeNodeType = 'file' | 'directory'

/** 快照文件树节点 */
export interface SnapshotFileTreeNode {
  /** 节点名称 */
  name: string
  /** 相对路径 */
  path: string
  /** 节点类型 */
  type: SnapshotFileTreeNodeType
  /** 文件元信息，仅文件节点存在 */
  meta?: {
    /** 快照 id */
    id: number
    /** 文件大小（字节） */
    bytes: number
    /** 文件行数 */
    length: number
  }
  /** 子节点，仅目录存在 */
  children?: SnapshotFileTreeNode[]
}

/**
 * 将路径分隔符统一为 /
 * @param filePath 文件路径
 */
function normalizeFilePath(filePath: string) {
  return filePath.replace(/\\/g, '/')
}

/**
 * 将绝对路径转为相对项目根目录的路径
 * @param filePath 文件绝对路径
 * @param projectDirPath 项目根目录绝对路径
 */
export function toProjectRelativePath(filePath: string, projectDirPath: string): string {
  const normalizedFile = normalizeFilePath(filePath)
  const normalizedProject = normalizeFilePath(projectDirPath).replace(/\/+$/, '')

  if (!normalizedProject) {
    return normalizedFile
  }

  const lowerFile = normalizedFile.toLowerCase()
  const lowerProject = normalizedProject.toLowerCase()

  if (lowerFile === lowerProject) {
    return ''
  }

  const projectPrefix = `${lowerProject}/`
  if (lowerFile.startsWith(projectPrefix)) {
    return normalizedFile.slice(normalizedProject.length + 1)
  }

  // 已是相对路径或未匹配到项目根目录时，原样返回
  return normalizedFile
}

/**
 * 向目录节点中插入快照文件路径
 * @param root 根节点
 * @param filePath 文件路径
 * @param file 快照文件项
 */
function insertSnapshotPath(root: SnapshotFileTreeNode, filePath: string, file: SnapshotFileItem) {
  const segments = filePath.split('/')
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
          meta: {
            id: file.id,
            bytes: file.bytes,
            length: file.length,
          },
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
function sortTreeNodes(nodes: SnapshotFileTreeNode[]) {
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
 * 将快照文件列表构建为文件树
 * @param files 快照文件列表
 * @param projectDirPath 项目根目录绝对路径，用于剥离绝对路径前缀
 */
export function buildSnapshotFileTree(files: SnapshotFileItem[], projectDirPath = ''): SnapshotFileTreeNode {
  const root: SnapshotFileTreeNode = {
    name: '',
    path: '',
    type: 'directory',
    children: [],
  }

  for (const file of files) {
    const relativePath = toProjectRelativePath(file.filePath, projectDirPath)
    if (!relativePath) continue
    insertSnapshotPath(root, relativePath, file)
  }

  if (root.children?.length) {
    sortTreeNodes(root.children)
  }

  return root
}

/**
 * 生成版本内目录展开状态 key
 * @param version 版本号
 * @param path 目录路径
 */
export function getSnapshotDirExpandKey(version: string, path: string) {
  return `${version}:${path}`
}
