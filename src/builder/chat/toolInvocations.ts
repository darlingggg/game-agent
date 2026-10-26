import type { ChatMessage, ChatMessagePart, ToolInvocation, ToolStatus, ToolSummary } from './types'

export const TOOL_PRESENTATION: Record<string, { label: string; finished: string; icon: string }> = {
  get_file_list: { label: '浏览文件', finished: '已浏览文件', icon: 'tool-list' },
  get_file_content: { label: '读取文件', finished: '已读取文件', icon: 'tool-read' },
  write_file_content: { label: '写入文件', finished: '已写入文件', icon: 'tool-write' },
  upsert_file: { label: '更新文件', finished: '已更新文件', icon: 'tool-update' },
  delete_file: { label: '删除文件', finished: '已删除文件', icon: 'tool-delete' },
  download_file: { label: '下载文件', finished: '已下载文件', icon: 'tool-download' },
  generate_image: { label: '生成图片', finished: '已生成图片', icon: 'tool-image' },
  search_web: { label: '搜索网页', finished: '已搜索网页', icon: 'tool-list' },
  fetch_page: { label: '读取网页', finished: '已读取网页', icon: 'tool-read' },
}

export function summarizeTools(tools: ToolInvocation[]): ToolSummary {
  const summary: ToolSummary = { total: tools.length, running: 0, succeeded: 0, failed: 0, cancelled: 0 }
  for (const tool of tools) summary[tool.status] += 1
  return summary
}

export function toolSummaryLabel(summary?: ToolSummary) {
  if (!summary?.total) return ''
  if (summary.running) return `正在执行 ${summary.total} 个操作`
  if (summary.failed) return `${summary.total} 个操作，${summary.failed} 个失败`
  if (summary.cancelled) return `已停止，${summary.total} 个操作`
  return `已完成 ${summary.total} 个操作`
}

export function upsertTool(message: ChatMessage, patch: Partial<ToolInvocation> & { toolCallId: string }) {
  const tools = message.tools ?? (message.tools = [])
  const summary = message.toolSummary ?? (message.toolSummary = summarizeTools(tools))
  let tool = tools.find((item) => item.toolCallId === patch.toolCallId)
  if (tool) {
    const { status, sequence, textOffset } = tool
    Object.assign(tool, patch, { sequence, textOffset })
    if (status !== 'running' && patch.status === 'running') tool.status = status
    if (status !== tool.status) {
      summary[status] -= 1
      summary[tool.status] += 1
    }
  } else {
    tool = { name: '项目工具', args: {}, status: 'running', sequence: tools.length + 1, textOffset: message.content.length, startedAt: new Date().toISOString(), ...patch }
    tools.push(tool)
    // 从响应式数组读回同一记录，展示片段与后续状态更新共享引用。
    tool = tools[tools.length - 1]!
    appendToolPart(message, tool)
    summary.total += 1
    summary[tool.status] += 1
  }
  const tasks = message.imageTasks?.filter((task) => task.toolCallId === tool.toolCallId)
  if (tasks?.length) tool.imageTasks = tasks
  return tool
}

function ensureParts(message: ChatMessage): ChatMessagePart[] {
  return message.parts ?? (message.parts = message.content ? [{ id: 'text-0', start: 0, text: message.content }] : [])
}

/** 正文事件只修改末尾文本，已有工具组和前面的正文片段保持原引用。 */
export function appendMessageText(message: ChatMessage, text: string) {
  if (!text) return
  const parts = ensureParts(message)
  const start = message.content.length
  message.content += text
  const last = parts.at(-1)
  if (last?.text !== undefined) last.text += text
  else parts.push({ id: `text-${start}`, start, text })
}

function appendToolPart(message: ChatMessage, tool: ToolInvocation) {
  const parts = ensureParts(message)
  const last = parts.at(-1)
  let remainingText = ''
  let boundary = Math.max(0, Math.min(message.content.length, tool.textOffset))
  if (last?.text !== undefined) {
    // 正常流式事件落在正文末尾；也允许在末尾文本片段中按位置切开。
    boundary = Math.max(last.start ?? 0, boundary)
    const prefix = last.text.slice(0, boundary - (last.start ?? 0))
    remainingText = last.text.slice(boundary - (last.start ?? 0))
    if (prefix.trim()) last.text = prefix
    else parts.pop()
  }
  const previous = parts.at(-1)
  if (previous?.tools) previous.tools.push(tool)
  else parts.push({ id: `tools-${tool.toolCallId}`, tools: [tool] })
  if (remainingText) parts.push({ id: `text-${boundary}`, start: boundary, text: remainingText })
}

/** 仅历史加载及重连快照使用：一次性恢复所有记录并重建展示片段。 */
export function restoreMessageTools(message: ChatMessage, records: ToolInvocation[]) {
  const previous = new Map(message.tools?.map((tool) => [tool.toolCallId, tool]))
  message.tools = records.map((record) => {
    const existing = previous.get(record.toolCallId)
    if (!existing) return { ...record }
    const status = existing.status
    Object.assign(existing, record)
    if (status !== 'running' && record.status === 'running') existing.status = status
    return existing
  })
  message.toolSummary = summarizeTools(message.tools)
  message.parts = liveToolParts(message.content, message.tools)
  message.toolsLoaded = true
}

export function settleTools(message: ChatMessage, status: ToolStatus) {
  for (const tool of message.tools ?? []) {
    if (tool.status !== 'running') continue
    tool.status = status === 'succeeded' ? 'failed' : status
    tool.error ||= status === 'cancelled' ? '执行已停止' : '执行已结束，未收到完整结果'
  }
  if (message.tools?.length) message.toolSummary = summarizeTools(message.tools)
  else if (message.toolSummary?.running) {
    const terminal = status === 'cancelled' ? 'cancelled' : 'failed'
    message.toolSummary[terminal] += message.toolSummary.running
    message.toolSummary.running = 0
  }
}

export function liveToolParts(content: string, tools: ToolInvocation[]) {
  const parts: ChatMessagePart[] = []
  let offset = 0
  for (const tool of [...tools].sort((a, b) => a.sequence - b.sequence)) {
    const next = Math.max(offset, Math.min(content.length, tool.textOffset))
    const text = content.slice(offset, next)
    // 只有实际正文才分隔工具组；同批并行或仅被空白分隔的连续调用合并展示。
    if (text.trim()) parts.push({ id: `text-${offset}`, start: offset, text })
    const previous = parts.at(-1)
    if (previous?.tools) previous.tools.push(tool)
    else parts.push({ id: `tools-${tool.toolCallId}`, tools: [tool] })
    offset = next
  }
  if (offset < content.length) parts.push({ id: `text-${offset}`, start: offset, text: content.slice(offset) })
  return parts
}
