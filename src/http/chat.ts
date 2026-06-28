import { getToken, handleUnauthorized, showRequestError } from '@/ajax'

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

  if (response.status === 401 || response.status === 403) {
    handleUnauthorized()
    throw new Error('登录已失效，请重新登录')
  }

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
        const message = json.data ?? 'AI 回复失败'
        showRequestError(message)
        throw new Error(message)
      }

      onEvent?.(json)
    }
  }
}
