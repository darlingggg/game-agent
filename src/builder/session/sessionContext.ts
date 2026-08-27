import { inject, type InjectionKey, type Ref } from 'vue'

/** 待创建新会话的占位 id */
export const PENDING_CONVERSATION_ID = -1

/** 首条消息创建会话后的回调数据 */
export interface CreatedConversationPayload {
  /** 会话 id */
  id: number
  /** 会话标题 */
  title: string
  /** 用户首条消息 */
  firstMessage: string
  createdAt: string
}

/** 会话面板与聊天面板共享状态 */
export interface SessionContext {
  /** 当前激活会话 id，待创建时为 PENDING_CONVERSATION_ID */
  activeConversationId: Ref<number | null>
  /** 是否处于待创建新会话状态 */
  isPendingNewSession: Ref<boolean>
  /** 聊天区重置信号，递增时清空消息 */
  chatResetSignal: Ref<number>
  /** 首条消息创建会话完成后的通知 */
  lastCreatedConversation: Ref<CreatedConversationPayload | null>
  /** 开始新建会话（等待用户发送首条消息） */
  startNewSession: () => void
  /**
   * 切换会话
   * @param conversationId 会话 id
   * @param resetChat 是否重置聊天区，默认 true
   */
  selectConversation: (conversationId: number, resetChat?: boolean) => void
  /** 会话栏是否收起 */
  sessionPanelCollapsed: Ref<boolean>
  /** 切换会话栏收起/展开 */
  toggleSessionPanelCollapsed: () => void
}

/** 会话上下文注入 key */
export const sessionContextKey: InjectionKey<SessionContext> = Symbol('sessionContext')

/**
 * 获取会话上下文
 */
export function useSessionContext() {
  const context = inject(sessionContextKey)
  if (!context) {
    throw new Error('sessionContext 未注入')
  }
  return context
}
