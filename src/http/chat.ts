import { fetchWithAuth, showRequestError } from '@/ajax'
import { consumeSseResponse } from '@/http/sse'

/** 聊天请求体 */
export interface ChatBody {
  prompt: string
  projectId: number
  conversationId?: number
  title?: string
  imageUrls?: string[]
}

/** 后端 SSE 事件结构 */
export interface ChatSseEvent {
  event: string
  data: string | Record<string, unknown> | null
}

/** 流式聊天参数 */
export interface ChatSseOptions extends ChatBody {
  /** 每解析到一个 SSE 事件时回调 */
  onEvent?: (event: ChatSseEvent) => void
  /** 中止信号 */
  signal?: AbortSignal
}

const CHAT_TERMINAL_EVENTS = new Set(['done', 'cancelled', 'error'])

async function consumeChatSseResponse(response: Response, onEvent?: (event: ChatSseEvent) => void): Promise<void> {
  const terminalEvent = await consumeSseResponse(response, (event) => onEvent?.(event as ChatSseEvent), { stopWhen: (event) => CHAT_TERMINAL_EVENTS.has(event.event) })

  if (!terminalEvent) {
    throw new Error('AI 响应流意外中断')
  }

  if (terminalEvent.event === 'error') {
    const message = typeof terminalEvent.data === 'string' ? terminalEvent.data : 'AI 回复失败'
    showRequestError(message)
    throw new Error(message)
  }
}

/**
 * 与 AI 流式对话
 * @param options 请求参数与事件回调
 */
export async function chatWithAI(options: ChatSseOptions) {
  const { prompt, projectId, conversationId, title, imageUrls, onEvent, signal } = options
  const body: ChatBody = { prompt, projectId }
  if (conversationId) {
    body.conversationId = conversationId
  }
  if (title?.trim()) {
    body.title = title.trim()
  }
  if (imageUrls?.length) {
    body.imageUrls = imageUrls
  }
  const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const message = `请求失败（${response.status}）`
    showRequestError(message)
    throw new Error(message)
  }

  await consumeChatSseResponse(response, onEvent)
}

export interface ReconnectChatSseOptions {
  messageId: number
  offset?: number
  onEvent?: (event: ChatSseEvent) => void
  signal?: AbortSignal
}

/**
 * 重新订阅后端托管中的 AI 消息流
 * @param options 重连参数
 */
export async function reconnectChatStream(options: ReconnectChatSseOptions) {
  const { messageId, offset = 0, onEvent, signal } = options
  const params = new URLSearchParams({ offset: String(Math.max(offset, 0)) })
  const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/chat/messages/${messageId}/stream?${params.toString()}`, {
    method: 'GET',
    signal,
  })

  if (!response.ok) {
    const message = `请求失败（${response.status}）`
    showRequestError(message)
    throw new Error(message)
  }

  await consumeChatSseResponse(response, onEvent)
}
