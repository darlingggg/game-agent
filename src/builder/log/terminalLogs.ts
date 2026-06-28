/** 终端头部上下文 */
export interface TerminalHeaderContext {
  /** 项目名称 */
  projectTitle?: string
  /** 项目 ID */
  projectId?: number
  /** 操作者账号 */
  account?: string
  /** 当前版本号 */
  version?: string
  /** 工作目录 */
  dirPath?: string
  /** 会话启动时间 */
  bootAt?: Date
}

/** 链路就绪时的提示语（按项目 id 取模，让不同项目略有差异） */
const READY_HINTS = [
  '链路就绪，在左侧输入需求开始协作 ↓',
  'Agent 待命中，描述你想做的功能吧 ↓',
  '开发环境已热身，随时可以开工 ↓',
  '代码助手在线，等你下达第一条指令 ↓',
]

/** 终端默认工作目录提示符 */
export const TERMINAL_PROMPT = 'game-agent>'

/**
 * 格式化会话启动时间
 * @param date 启动时间
 */
function formatBootTime(date: Date): string {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * 缩短工作目录展示，保留末尾路径段
 * @param dirPath 完整目录
 */
function shortenDirPath(dirPath: string): string {
  const normalized = dirPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= 2) return normalized
  return `…/${segments.slice(-2).join('/')}`
}

/**
 * 获取链路就绪提示语
 * @param projectId 项目 ID
 */
function getReadyHint(projectId?: number): string {
  if (!projectId) return '等待加载项目，完成后即可开始对话 ↓'
  return READY_HINTS[projectId % READY_HINTS.length]!
}

/**
 * 构建个性化终端头部日志行
 * @param context 当前会话上下文
 */
export function buildTerminalHeaderLines(context: TerminalHeaderContext = {}): string[] {
  const bootTime = formatBootTime(context.bootAt ?? new Date())
  const lines: string[] = [
    '    ╭──────────────────────────────────────────╮',
    '    │  ⚡ GameAgent · 你的 AI 会话助手终端     │',
    '    ╰──────────────────────────────────────────╯',
    '',
  ]

  if (context.account) {
    lines.push(`[session] operator @ ${context.account}`)
  }

  if (context.projectTitle) {
    const idLabel = context.projectId ? `#${context.projectId}` : '—'
    const versionLabel = context.version ? ` · v${context.version}` : ''
    lines.push(`[project] ${idLabel} ${context.projectTitle}${versionLabel}`)
  } else {
    lines.push('[project] — 未加载项目')
  }

  if (context.dirPath) {
    lines.push(`[workspace] ${shortenDirPath(context.dirPath)}`)
  }

  lines.push(`[boot] ${bootTime}  ·  ${getReadyHint(context.projectId)}`, '')

  return lines
}
