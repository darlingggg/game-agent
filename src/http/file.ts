import axios from '@/ajax'

/** projectTemp 项目根目录绝对路径 */
export const PROJECT_TEMP_DIR = 'C:/pro_self/projectTemp'

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
