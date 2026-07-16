import axios from '@/ajax'

export interface LogItem {
  id: number
  projectId: number
  /** 会话标题，历史数据可能为 null */
  title: string | null
  content: string
  account: string
  createdAt: string
}

/** 获取日志列表 */
export const getLogList = (params: { projectId: number; title?: string }): Promise<LogItem[]> => {
  return axios.get('/log/list', { params })
}

/** 添加日志 */
export const addLog = (data: { content: string; projectId: number; title: string }): Promise<{ content: string; affectedRows: number }> => {
  return axios.post('/log/add', data)
}
