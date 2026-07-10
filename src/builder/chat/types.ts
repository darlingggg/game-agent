/** 消息角色 */
export type ChatRole = 'user' | 'assistant'

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
  /** 图像识别内容，与 Agent 正文区分展示 */
  vision?: ChatVisionResult
  /** 是否正在流式输出 */
  streaming?: boolean
  /** 消息创建时间 */
  createdAt?: string
}
