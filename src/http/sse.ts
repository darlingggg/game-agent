/** 后端 SSE 事件结构 */
export interface SseEvent {
  event: string
  data: unknown
}

/**
 * 消费 fetch SSE 响应流
 * @param response fetch 响应
 * @param onEvent 每解析到一个事件时回调
 */
export async function consumeSseResponse(
  response: Response,
  onEvent?: (event: SseEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('获取响应的可读流失败')
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

      try {
        const json = JSON.parse(raw) as SseEvent
        onEvent?.(json)
      } catch {
        // 忽略空行或不完整数据
      }
    }
  }
}
