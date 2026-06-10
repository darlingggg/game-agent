/** SSE 模拟流式回调参数 */
export interface MockSseOptions {
  /** 要回显的完整文本 */
  text: string
  /** 每块文本回调 */
  onChunk: (chunk: string) => void
  /** 中止信号 */
  signal?: AbortSignal
  /** 每块间隔毫秒数，默认 40 */
  intervalMs?: number
}

/**
 * 模拟 SSE 流式输出，逐字回显文本
 * @param options 流式参数
 */
export function mockChatSseStream(options: MockSseOptions): Promise<void> {
  const { text, onChunk, signal, intervalMs = 40 } = options

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    let index = 0
    let timerId: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
      }
      signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', onAbort)

    const tick = () => {
      if (signal?.aborted) {
        onAbort()
        return
      }

      if (index >= text.length) {
        cleanup()
        resolve()
        return
      }

      onChunk(text[index]!)
      index += 1
      timerId = setTimeout(tick, intervalMs)
    }

    timerId = setTimeout(tick, intervalMs)
  })
}
