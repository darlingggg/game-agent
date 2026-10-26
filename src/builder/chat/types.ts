import type { ImageGenerationTask } from '@/http/imageGeneration'

/** 消息角色 */
export type ChatRole = 'user' | 'assistant'

export type ToolStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'
export interface ToolSummary {
  total: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
}
export interface ToolInvocation {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  status: ToolStatus
  sequence: number
  textOffset: number
  startedAt: string
  finishedAt?: string
  durationMs?: number
  imageTasks?: ImageGenerationTask[]
  expanded?: boolean
}

/** 图像识别流式内容 */
export interface ChatVisionResult {
  /** 图像思考过程 */
  reasoning: string
  /** 图像理解结果 */
  answer: string
  /** 是否正在识别图片 */
  streaming?: boolean
}

/** 单条聊天消息 */
export interface ChatMessage {
  /** 消息唯一标识 */
  id: string
  /** 发送方角色 */
  role: ChatRole
  /** 消息正文 */
  content: string
  /** 后端 messages 表 id，用于刷新后 SSE 重连 */
  messageId?: number
  /** 后端 sessions.id，用于关联工具任务 */
  sessionId?: number
  /** 主 AI 在本次回复中创建的图片任务 */
  imageTasks?: ImageGenerationTask[]
  tools?: ToolInvocation[]
  toolSummary?: ToolSummary
  history?: boolean
  toolsLoaded?: boolean
  toolsLoading?: boolean
  toolsError?: string
  /** 历史回复失败原因；工具结果可能已独立完成 */
  errorMsg?: string
  /** 图像识别内容，与 Agent 正文区分展示 */
  vision?: ChatVisionResult
  /** 是否正在流式输出 */
  streaming?: boolean
  /** 当前回复是否由用户手动收起，仅用于前端展示 */
  replyCollapsed?: boolean
  /** 消息创建时间 */
  createdAt?: string
}
