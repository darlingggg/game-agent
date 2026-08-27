import { fetchWithAuth, showRequestError } from '@/ajax'

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

  // 获取响应的可读流
  const reader = response.body?.getReader()
  if (!reader) {
    const message = '获取响应的可读流失败'
    showRequestError(message)
    throw new Error(message)
  }
  const decoder = new TextDecoder('utf-8')

  let buffer = '' // 解决数据分包粘包问题

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // 解码二进制数据
    buffer += decoder.decode(value, { stream: true })

    // 按行分割（SSE 标准协议以 \n\n 分隔事件，但大多数实现以 \n 分隔）
    const lines = buffer.split('\n')
    // 保留最后一个可能不完整的行
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue

      const raw = line.slice(5).trim()
      if (!raw) continue

      let json: ChatSseEvent
      try {
        json = JSON.parse(raw) as ChatSseEvent
      } catch {
        // 忽略不完整 JSON
        continue
      }

      if (json.event === 'error') {
        const message = typeof json.data === 'string' ? json.data : 'AI 回复失败'
        showRequestError(message)
        throw new Error(message)
      }

      onEvent?.(json)
    }
  }
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

async function consumeChatSseResponse(response: Response, onEvent?: (event: ChatSseEvent) => void) {
  const reader = response.body?.getReader()
  if (!reader) {
    const message = '获取响应的可读流失败'
    showRequestError(message)
    throw new Error(message)
  }
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue

      const raw = line.slice(5).trim()
      if (!raw) continue

      let json: ChatSseEvent
      try {
        json = JSON.parse(raw) as ChatSseEvent
      } catch {
        continue
      }

      if (json.event === 'error') {
        const message = typeof json.data === 'string' ? json.data : 'AI 回复失败'
        showRequestError(message)
        throw new Error(message)
      }

      onEvent?.(json)
    }
  }
}
