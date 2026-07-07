import axios from '@/ajax'
export interface snapshotItem {
  id: number // 快照id
  projectId: number // 项目id
  account: string // 用户账号
  version: string // 版本号
  desc: string // 描述
  filePath: string // 文件路径
  fileContent: string // 文件内容
  bytes: number // 文件大小
  length: number // 文件行度
  type: 0 | 1 // 0: 版本快照 1: 模板存档
  tempVersion: string // 模板版本号
  createdAt: string // 创建时间
}

export interface addSnapshotBody {
  projectId: number
  dirPath: string // 项目根路径 绝对路径
  version: string
  desc: string // 版本描述
}

export interface updateSnapshotBody {
  projectId: number
  version: string // 新版本号
  oldVersion: string // 旧版本号
  desc: string // 版本描述
}

// 添加快照版本
export const addSnapshot = async (body: addSnapshotBody): Promise<{ content: string; id: number }> => {
  return axios.post('/snapshot/add', body)
}

// 获取快照版本列表
export const getSnapshotList = async (params: { projectId: number }): Promise<snapshotItem[]> => {
  return axios.get('/snapshot/list', { params })
}

// 删除快照版本
export const deleteSnapshot = async (body: { projectId: number; version: string }): Promise<{ content: string; affectedRows: number }> => {
  return axios.post('/snapshot/delete', body)
}

// 修改快照信息
export const updateSnapshot = async (body: updateSnapshotBody): Promise<{ content: string; affectedRows: number }> => {
  return axios.patch('/snapshot/change', body)
}
