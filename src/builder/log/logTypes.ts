/** 日志类型前缀 */
export type LogPrefix = 'info' | 'ai' | 'tool' | 'plain'

/** 工具日志执行状态 */
export type ToolLogStatus = 'loading' | 'success' | 'error' | 'aborted'

/** 基础日志条目 */
export interface BaseLogEntry {
  /** 唯一标识 */
  id: string
  /** 日志前缀类型 */
  prefix: LogPrefix
  /** 展示文本 */
  content: string
  /** 创建时间 */
  createdAt: string
}

/** AI 文本日志 */
export interface AiLogEntry extends BaseLogEntry {
  prefix: 'ai'
  /** 是否仍在流式输出 */
  streaming?: boolean
  /** 长文本是否已展开 */
  expanded?: boolean
}

/** 工具调用日志 */
export interface ToolLogEntry extends BaseLogEntry {
  prefix: 'tool'
  /** 工具名称 */
  toolName: string
  /** 调用参数（JSON 字符串） */
  params: string
  /** 执行结果（JSON 字符串） */
  result?: string
  /** 执行状态 */
  status: ToolLogStatus
  /** 下拉详情是否展开 */
  expanded: boolean
}

/** 实时日志条目 */
export type LiveLogEntry = AiLogEntry | ToolLogEntry

/** 纯文本日志（info 等无法解析的行） */
export interface PlainLogEntry extends BaseLogEntry {
  prefix: 'plain'
}

/** 日志面板展示条目 */
export type DisplayLogEntry = LiveLogEntry | PlainLogEntry
