import axios from '@/ajax'
import type { ToolInvocation, ToolSummary } from '@/builder/chat/types'

export const getMessageTools = (messageId: number): Promise<{ tools: ToolInvocation[]; summary: ToolSummary }> => axios.get(`/chat/messages/${messageId}/tools`)
