import type { AiLogEntry, DisplayLogEntry, ToolLogEntry } from './logTypes'

/** AI 日志超过该行数时默认折叠 */
export const AI_LOG_COLLAPSE_LINE_THRESHOLD = 3

/**
 * 统计文本行数
 * @param text 文本内容
 */
export function countTextLines(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}

/**
 * 是否应对 AI 日志启用折叠
 * @param content AI 文本
 * @param streaming 是否仍在流式输出
 */
export function shouldCollapseAiLog(content: string, streaming?: boolean): boolean {
  if (streaming) return false
  return countTextLines(content) > AI_LOG_COLLAPSE_LINE_THRESHOLD
}

/**
 * 获取 AI 日志折叠时的预览文本（前 3 行）
 * @param content AI 文本
 */
export function getAiCollapsedPreview(content: string): string {
  return content.split('\n').slice(0, AI_LOG_COLLAPSE_LINE_THRESHOLD).join('\n')
}

/**
 * 解析持久化的工具日志正文
 * @param body 去掉 [tool] 前缀后的正文
 * @param id 日志 id
 * @param createdAt 创建时间
 */
function parsePersistedToolBody(body: string, id: string, createdAt: string): ToolLogEntry | null {
  const paramSep = ' $$ 参数: '
  const resultSep = ' $$ 结果: '
  const paramIndex = body.indexOf(paramSep)
  if (paramIndex === -1) return null

  const toolPart = body.slice(0, paramIndex).trim()
  const toolName = toolPart.replace(/^正在执行工具:\s*/, '').trim()
  if (!toolName) return null

  const afterParams = body.slice(paramIndex + paramSep.length)
  const resultIndex = afterParams.indexOf(resultSep)
  if (resultIndex === -1) return null

  const params = afterParams.slice(0, resultIndex).trim()
  let resultPart = afterParams.slice(resultIndex + resultSep.length).trim()

  let status: ToolLogEntry['status'] = 'success'
  if (resultPart.endsWith('❌')) {
    status = 'error'
    resultPart = resultPart.slice(0, -1).trim()
  } else if (resultPart.endsWith('✅')) {
    resultPart = resultPart.slice(0, -1).trim()
  }

  return {
    id,
    prefix: 'tool',
    content: `正在执行工具: ${toolName}`,
    toolName,
    params,
    result: resultPart,
    status,
    expanded: false,
    createdAt,
  }
}

/**
 * 将接口返回的单条日志解析为可展示条目
 * @param line 日志原文
 * @param index 列表索引
 * @param createdAt 创建时间
 */
export function parsePersistedLogLine(line: string, index: number, createdAt = ''): DisplayLogEntry {
  const id = `history-${index}`

  if (line.startsWith('[ai] ')) {
    return {
      id,
      prefix: 'ai',
      content: line.slice(5),
      createdAt,
      expanded: false,
    }
  }

  if (line.startsWith('[tool] ')) {
    const toolEntry = parsePersistedToolBody(line.slice(7), id, createdAt)
    if (toolEntry) return toolEntry
  }

  return {
    id,
    prefix: 'plain',
    content: line,
    createdAt,
  }
}
