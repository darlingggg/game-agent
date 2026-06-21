/** tool_start 解析结果 */
export interface ParsedToolStart {
  /** 工具名称 */
  toolName: string
  /** 调用参数 */
  params: string
}

/** tool_end 解析结果 */
export interface ParsedToolEnd {
  /** 工具名称 */
  toolName: string
  /** 执行结果 */
  result: string
  /** 是否执行成功 */
  success: boolean
}

/**
 * 解析 tool_start 事件数据
 * @param data SSE 原始数据
 */
export function parseToolStart(data: string): ParsedToolStart | null {
  const separatorIndex = data.indexOf('$$')
  if (separatorIndex === -1) return null

  const head = data.slice(0, separatorIndex).trim()
  const tail = data.slice(separatorIndex + 2).trim()
  const toolName = head.replace(/^正在执行工具:\s*/, '').trim()
  const params = tail.replace(/^参数:\s*/, '').trim()

  if (!toolName) return null
  return { toolName, params }
}

/**
 * 解析 tool_end 事件数据
 * @param data SSE 原始数据
 */
export function parseToolEnd(data: string): ParsedToolEnd | null {
  const separatorIndex = data.indexOf('$$')
  if (separatorIndex === -1) return null

  const head = data.slice(0, separatorIndex).trim()
  const tail = data.slice(separatorIndex + 2).trim()
  const toolName = head.replace(/^工具执行完毕:\s*/, '').trim()
  const result = tail.replace(/^结果:\s*/, '').trim()

  if (!toolName) return null

  let success = true
  try {
    const parsed = JSON.parse(result) as { success?: boolean }
    if (typeof parsed.success === 'boolean') {
      success = parsed.success
    }
  } catch {
    success = false
  }

  return { toolName, result, success }
}

/**
 * 构建工具日志持久化内容
 * @param toolName 工具名称
 * @param params 调用参数
 * @param result 执行结果
 * @param success 是否成功
 */
export function buildToolLogContent(toolName: string, params: string, result: string, success: boolean): string {
  const statusMark = success ? '✅' : '❌'
  return `[tool] 正在执行工具: ${toolName} $$ 参数: ${params} $$ 结果: ${result} ${statusMark}`
}
