import axios from '@/ajax'

export interface ConversationStats {
  id: number
  projectId: number
  title: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  currentContextTokens: number
  contextLimit: number
  summaryExists?: boolean
  updatedAt?: string
}

export interface ProjectUsage {
  projectId: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export const getConversationStats = (params: { conversationId?: number | null; projectId?: number; title?: string }) =>
  axios.get<ConversationStats>('/conversation/stats', { params })

export const getProjectUsage = (projectId: number) =>
  axios.get<ProjectUsage>('/project/usage', { params: { projectId } })

export const cancelChatMessage = (messageId: number) =>
  axios.post<{ cancelled: boolean; status: string }>(`/chat/messages/${messageId}/cancel`)
