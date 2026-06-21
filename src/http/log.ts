import axios from '@/ajax'

export interface LogItem {
  id: number
  projectId: number
  content: string
  account: string
  createdAt: string
}

/** 获取日志列表 */
export const getLogList = (params: { projectId: number }): Promise<LogItem[]> => {
  return axios.get('/log/list', { params })
}

/** 添加日志 */
export const addLog = (data: { content: string, projectId: number }): Promise<{content: string,affectedRows: number}> => {
  return axios.post('/log/add', data)
}
