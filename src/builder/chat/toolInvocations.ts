import type { ChatMessage, ToolInvocation, ToolStatus, ToolSummary } from './types'

export const TOOL_PRESENTATION: Record<string, { label: string; finished: string; icon: string }> = {
  get_file_list: { label: '浏览文件', finished: '已浏览文件', icon: 'tool-list' },
  get_file_content: { label: '读取文件', finished: '已读取文件', icon: 'tool-read' },
  write_file_content: { label: '写入文件', finished: '已写入文件', icon: 'tool-write' },
  upsert_file: { label: '更新文件', finished: '已更新文件', icon: 'tool-update' },
  delete_file: { label: '删除文件', finished: '已删除文件', icon: 'tool-delete' },
  download_file: { label: '下载文件', finished: '已下载文件', icon: 'tool-download' },
  generate_image: { label: '生成图片', finished: '已生成图片', icon: 'tool-image' },
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
  let tool = tools.find((item) => item.toolCallId === patch.toolCallId)
  if (tool) {
    const status = tool.status
    Object.assign(tool, patch)
    if (status !== 'running' && patch.status === 'running') tool.status = status
  } else {
    tool = { name: '项目工具', args: {}, status: 'running', sequence: tools.length + 1, textOffset: message.content.length, startedAt: new Date().toISOString(), ...patch }
    tools.push(tool)
  }
  const tasks = message.imageTasks?.filter((task) => task.toolCallId === tool.toolCallId)
  if (tasks?.length) tool.imageTasks = tasks
  message.toolSummary = summarizeTools(tools)
  return tool
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
  const parts: Array<{ id: string; text?: string; tool?: ToolInvocation }> = []
  let offset = 0
  for (const tool of [...tools].sort((a, b) => a.sequence - b.sequence)) {
    const next = Math.max(offset, Math.min(content.length, tool.textOffset))
    if (next > offset) parts.push({ id: `text-${offset}`, text: content.slice(offset, next) })
    parts.push({ id: `tool-${tool.toolCallId}`, tool })
    offset = next
  }
  if (offset < content.length) parts.push({ id: `text-${offset}`, text: content.slice(offset) })
  return parts
}
