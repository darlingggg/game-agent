import axios from '@/ajax'

export interface sessionItem {
  id: number
  messageId?: number
  projectId: number
  title: string
  account: string
  role: 'user' | 'assistant' | 'tool' | 'vision'
  content?: string
  createdAt: string
}

export interface createSessionParams {
  projectId: number
  title?: string
  role: 'user' | 'assistant' | 'tool' | 'vision'
  content: string
}

export interface updateSessionParams {
  oldTitle: string
  title?: string
  projectId?: string
}

// 获取会话列表
export const getSessionList = async (params: { projectId: number; title?: string }): Promise<sessionItem[]> => {
  return axios.get('/session/list', { params })
}

// 创建会话
export const createSession = async (data: createSessionParams): Promise<{ id: number; content: string }> => {
  return axios.post('/session/create', data)
}

// 修改会话标题
export const updateSession = async (data: updateSessionParams): Promise<{ content: string; affectedRows: number }> => {
  return axios.patch('/session/update', data)
}

// 删除会话
export const deleteSession = async (data: { projectId: number; title: string }): Promise<{ content: string; affectedRows: number }> => {
  return axios.post('/session/delete', data)
}

// 获取ai回复
export const getAiReply = async (params: { id: number }): Promise<{ content: string; id: number; createdAt: string }> => {
  const result = await axios.get('/session/detail', { params }) as
    | { content: string; id: number; createdAt: string }
    | { content: string; id: number; createdAt: string }[]

  const row = Array.isArray(result) ? result[0] : result
  if (!row?.content) {
    throw new Error('回复内容为空')
  }
  return row
}
