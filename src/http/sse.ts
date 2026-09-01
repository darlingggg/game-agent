/** 后端 SSE 事件结构 */
export interface SseEvent {
  event: string
  data: unknown
}

export interface ConsumeSseOptions {
  /** 返回 true 时停止消费当前响应流 */
  stopWhen?: (event: SseEvent) => boolean
}

/**
 * 解析一个完整的 SSE 事件块，同时兼容标准 event/data 格式与项目现有的 JSON 包装格式。
 */
function parseSseBlock(block: string): SseEvent | null {
  let eventName = 'message'
  const dataLines: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue

    const separatorIndex = line.indexOf(':')
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line
    let value = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : ''
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') {
      eventName = value || 'message'
    } else if (field === 'data') {
      dataLines.push(value)
    }
  }

  if (dataLines.length === 0) return null

  const rawData = dataLines.join('\n')
  let data: unknown = rawData
  try {
    data = JSON.parse(rawData)
  } catch {
    // 标准 SSE 允许 data 为普通文本。
  }

  // 当前后端使用 data: {"event":"text","data":"..."} 的包装格式。
  if (data && typeof data === 'object' && 'event' in data && typeof data.event === 'string' && 'data' in data) {
    return { event: data.event, data: data.data }
  }

  return { event: eventName, data }
}

/**
 * 消费 fetch SSE 响应流
 * @param response fetch 响应
 * @param onEvent 每解析到一个事件时回调
 */
export async function consumeSseResponse(response: Response, onEvent?: (event: SseEvent) => void, options: ConsumeSseOptions = {}): Promise<SseEvent | null> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('获取响应的可读流失败')
  }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: !done })
      if (done) buffer += decoder.decode()

      const blocks = buffer.split(/\r?\n\r?\n/)
      if (done) {
        buffer = ''
      } else {
        buffer = blocks.pop() ?? ''
      }

      for (const block of blocks) {
        const event = parseSseBlock(block)
        if (!event) continue

        onEvent?.(event)
        if (options.stopWhen?.(event)) {
          await reader.cancel().catch(() => undefined)
          return event
        }
      }

      if (done) return null
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}
