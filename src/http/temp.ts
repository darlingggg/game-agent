import axios from '@/ajax'

export interface fileItem {
  path: string // 具体修改的文件的相对路径(相对于项目根)
  description: string // 文件的简要描述
  action: 'add' | 'update' | 'delete' // 文件的操作类型
}

export interface contentItem {
  version: string // 版本号
  description: string // 版本描述
  createdAt: string // 创建时间
  files: fileItem[] // 文件列表
}

export interface versionItem {
  version: string // 版本号
  fileName: string // 版本更新json说明的文件名
  filePath: string // 版本更新json说明的绝对路径
  content: contentItem // 版本 json 解析后的内容
}

export interface updateTempBody {
  projectId: number
  upToVersion?: string // 更新到哪个版本(不传则更新到最新版本)
}

// 获取当前项目的模板版本
export const getTempCurrentVersion = async (params: { projectId: number }): Promise<{ version: string }> => {
  return axios.get('/temp/current', { params })
}

// 获取模板的最新项目
export const getTempLatestVersion = async (): Promise<{ version: string; fileContent: string }> => {
  return axios.get('/temp/latest')
}

// 更新模板
export const updateTemp = async (body: updateTempBody): Promise<{ content: string; affectedRows: number }> => {
  return axios.post('/temp/update', body)
}

// 获取模板版本列表
export const getTempVersionList = async (): Promise<versionItem[]> => {
  return axios.get('/temp/list')
}
