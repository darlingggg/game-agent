import axios from '@/ajax'

export interface sessionItem {
  id: number
  projectId: number
  conversationId?: number
  messageId?: number
  title: string
  account: string
  role: 'user' | 'assistant' | 'tool' | 'vision'
  content?: string
  status?: 'completed' | 'streaming' | 'failed'
  errorMsg?: string | null
  createdAt: string
  updatedAt?: string
}

interface RawSessionItem {
  id: number
  projectId?: number
  project_id?: number
  conversationId?: number | null
  conversation_id?: number | null
  messageId?: number | null
  message_id?: number | null
  title?: string
  account?: string
  role: sessionItem['role']
  content?: string
  status?: sessionItem['status']
  errorMsg?: string | null
  error_msg?: string | null
  createdAt?: string
  created_at?: string
  updatedAt?: string
  updated_at?: string
}

const USER_PROMPT_SEPARATOR_RE = /\r?\n\s*---\s*(?:\r?\n|$)/

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

function getUserDisplayContent(content?: string): string | undefined {
  if (!content) return content
  const [displayContent] = content.split(USER_PROMPT_SEPARATOR_RE, 1)
  return displayContent?.trimEnd() || content
}

function normalizeSessionItem(item: RawSessionItem): sessionItem {
  const messageId = item.messageId ?? item.message_id ?? undefined
  return {
    id: item.id,
    projectId: item.projectId ?? item.project_id ?? 0,
    conversationId: item.conversationId ?? item.conversation_id ?? undefined,
    messageId: messageId === null ? undefined : messageId,
    title: item.title ?? '',
    account: item.account ?? '',
    role: item.role,
    content: item.role === 'user' ? getUserDisplayContent(item.content) : item.content,
    status: item.status,
    errorMsg: item.errorMsg ?? item.error_msg ?? null,
    createdAt: item.createdAt ?? item.created_at ?? '',
    updatedAt: item.updatedAt ?? item.updated_at ?? undefined,
  }
}

// 获取会话列表
export const getSessionList = async (params: { projectId: number; title?: string }): Promise<sessionItem[]> => {
  const list = await axios.get<unknown, RawSessionItem[]>('/session/list', { params })
  return list.map(normalizeSessionItem)
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
