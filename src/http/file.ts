import axios, { fetchWithAuth } from '@/ajax'

/** 文件列表查询参数 */
interface FileListParams {
  /** 目标目录绝对路径 */
  dir: string
}

/** 接口返回的文件项 */
export interface ProjectTempFileItem {
  /** 文件绝对路径 */
  path: string
  /** 文件名 */
  name: string
  /** 相对 projectTemp 根目录的路径 */
  relativePath: string
  /** 文件字节数（fs.stat size），与快照保存逻辑一致 */
  bytes?: number
  /** 文件行数，与快照保存逻辑一致 */
  length?: number
}

/** 文件 stat 信息 */
export interface ProjectFileStat {
  /** 文件字节数（fs.stat size） */
  bytes: number
  /** 文件行数 */
  length: number
  path: string
  relativePath: string
}

/** 文件内容查询参数 */
interface FileContentParams {
  /** 目标目录绝对路径 */
  dir: string
  /** 相对路径 */
  path: string
}

/** 文件写入参数 */
interface FileWriteParams {
  /** 目标目录绝对路径 */
  dir: string
  /** 相对路径 */
  path: string
  /** 文件内容 */
  content: string
}

/**
 * 获取目录下的文件列表
 * @param params 查询参数
 */
export const getFileList = (params: FileListParams): Promise<ProjectTempFileItem[]> => {
  return axios.get('/files', { params })
}

/**
 * 获取指定文件的 stat 信息（bytes 为 fs.stat size，length 与快照保存逻辑一致）
 * @param params 查询参数
 */
export const getFileStat = (body: { dir: string; path: string }): Promise<ProjectFileStat> => {
  return axios.post('/file/meta', body)
}

/**
 * 获取指定文件内容
 * @param params 查询参数
 */
export const getFileContent = (params: FileContentParams): Promise<string> => {
  return axios.get('/file/content', { params })
}

/**
 * 写入指定文件内容
 * @param data 写入参数
 */
export const writeFileContent = (data: FileWriteParams): Promise<void> => {
  return axios.post('/file/write', data)
}

/** 删除指定文件
 * @param body.dir 项目根路径
 * @param body.path 文件绝对路径
 */
export const deleteFile = (body: { dir: string; path: string }): Promise<void> => {
  return axios.post('/file/delete', body)
}

/** 素材导入单项结果 */
export interface FileDownloadResultItem {
  /** 来源类型 */
  source: 'url' | 'file'
  /** 是否成功 */
  success: boolean
  /** 失败原因 */
  message?: string
  /** source 为 url 时的原始地址 */
  url?: string
  /** source 为 file 时的原始文件名 */
  originalName?: string
  /** 保存后的绝对路径 */
  path?: string
  /** 相对项目根路径，如 public/images/a.png */
  relativePath?: string
  /** 保存后的文件名 */
  fileName?: string
  /** 文件字节数 */
  bytes?: number
}

/** 素材导入成功 data */
export interface FileDownloadData {
  /** 项目根路径 */
  dirPath: string
  /** 实际保存相对目录，如 public 或 public/images */
  saveDir: string
  /** 逐条处理结果 */
  results: FileDownloadResultItem[]
}

/** 素材导入参数 */
export interface FileDownloadParams {
  /** 项目根目录绝对路径 */
  dirPath: string
  /** 保存到 public 下的子目录，默认 '/' */
  path?: string
  /** 远程文件地址列表 */
  urls?: string[]
  /** 本地上传文件列表 */
  files?: File[]
  /**
   * 自定义保存文件名列表，与资源按顺序对应：先 urls 再 files；
   * 空字符串表示该项使用默认文件名
   */
  saveNames?: string[]
}

/**
 * 将远程 URL 或本地文件写入项目 public 目录
 * @param params 导入参数（urls 与 files 至少一类）
 */
export const downloadProjectFiles = (params: FileDownloadParams): Promise<FileDownloadData> => {
  const formData = new FormData()
  formData.append('dirPath', params.dirPath)
  formData.append('path', params.path?.trim() || '/')

  if (params.urls?.length) {
    formData.append('urls', JSON.stringify(params.urls))
  }

  if (params.files?.length) {
    for (const file of params.files) {
      formData.append('files', file)
    }
  }

  if (params.saveNames?.length) {
    formData.append('saveNames', JSON.stringify(params.saveNames))
  }

  return axios.post('/file/download', formData, {
    timeout: 60000,
  })
}

/** 删除素材参数 */
export interface DeleteProjectAssetParams {
  /** 项目根目录绝对路径 */
  dirPath: string
  /** 文件路径（相对项目根或绝对路径，须在 public 内） */
  path: string
}

/** 删除素材成功 data */
export interface DeleteProjectAssetData {
  /** 项目根路径 */
  dirPath: string
  /** 删除文件的绝对路径 */
  path: string
  /** 相对项目根路径 */
  relativePath: string
}

/**
 * 删除项目 public 目录下的素材文件（不可删除 public/favicon.ico）
 * @param params 删除参数
 */
export const deleteProjectAsset = (params: DeleteProjectAssetParams): Promise<DeleteProjectAssetData> => {
  return axios.post('/file/asset/delete', {
    dirPath: params.dirPath,
    path: params.path,
  })
}

/**
 * 读取项目 public 素材为 Blob（用于前端预览）
 * @param params 读取参数
 */
export async function fetchProjectAssetBlob(params: DeleteProjectAssetParams): Promise<Blob> {
  const query = new URLSearchParams({
    dirPath: params.dirPath,
    path: params.path,
  })
  const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/file/asset?${query.toString()}`)
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as { message?: string; status?: number }
    throw new Error(payload.message || '素材预览加载失败')
  }

  if (!response.ok) {
    throw new Error('素材预览加载失败')
  }

  return response.blob()
}
