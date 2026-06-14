/** 无用户消息时的预览占位文案 */
export const SESSION_EMPTY_PREVIEW = '开始与ai对话吧'

/** 静态会话列表项 */
export interface SessionListItem {
  /** 会话唯一标识 */
  id: string
  /** 首条用户消息，用作标题 */
  firstMessage: string
  /** 末条用户消息，用作预览；空字符串则显示占位文案 */
  lastMessage: string
  /** 展示时间（HH:mm） */
  time: string
}

/** 静态会话列表（后端接口就绪后替换） */
export const MOCK_SESSION_LIST: SessionListItem[] = [
  {
    id: 'session-1',
    firstMessage: '写一个愤怒小鸟的游戏，需要...',
    lastMessage: '弹弓离左侧的距离大点，看是否可以做成...',
    time: '09:44',
  },
  {
    id: 'session-2',
    firstMessage: '新会话',
    lastMessage: '',
    time: '08:12',
  },
]

/** 静态用户昵称（后端接口就绪后替换） */
export const MOCK_NICKNAME = '用户名'
