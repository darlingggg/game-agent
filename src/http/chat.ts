import { getToken } from '@/ajax'

/** 聊天请求体 */
export interface ChatBody {
  prompt: string
  projectId: number
  title?: string
}

/** 后端 SSE 事件结构 */
export interface ChatSseEvent {
  event: string
  data: string | null
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
  const { prompt, projectId, title, onEvent, signal } = options
  const token = getToken()
  const body: ChatBody = { prompt, projectId }
  if (title?.trim()) {
    body.title = title.trim()
  }
  const response = await fetch(`${import.meta.env.VITE_API_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`, // 解决鉴权问题
    },
    body: JSON.stringify(body),
    signal,
  })

  // 获取响应的可读流
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('获取响应的可读流失败')
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

      try {
        const json = JSON.parse(raw) as ChatSseEvent
        onEvent?.(json)
      } catch {
        // 忽略空行或不完整数据
      }
    }
  }
}
