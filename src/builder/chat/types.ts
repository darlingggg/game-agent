/** 消息角色 */
export type ChatRole = 'user' | 'assistant'

/** 单条聊天消息 */
export interface ChatMessage {
  /** 消息唯一标识 */
  id: string
  /** 发送方角色 */
  role: ChatRole
  /** 消息正文 */
  content: string
  /** AI 回复在 messages 表中的 id，content 为空时用于懒加载 */
  messageId?: number
  /** 是否正在流式输出 */
  streaming?: boolean
  /** 消息创建时间 */
  createdAt?: string
}
