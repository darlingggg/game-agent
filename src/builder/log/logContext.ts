import { inject, ref, type InjectionKey, type Ref } from 'vue'
import { addLog, getLogList } from '@/http/log'
import {
  DELETE_FILE_TOOL,
  UPSERT_FILE_TOOL,
  WRITE_FILE_CONTENT_TOOL,
  syncDeleteFileToPreview,
  syncUpsertFileToPreview,
  syncWriteFileContentToPreview,
} from '../preview/previewSync'
import { buildToolLogContent, parseToolEnd, parseToolStart } from './logParser'
import { parsePersistedLogLine } from './parsePersistedLog'
import type { DisplayLogEntry, LiveLogEntry, ToolLogEntry } from './logTypes'

/** 日志上下文 */
export interface LogContext {
  /** 历史日志条目（接口拉取并解析） */
  historyEntries: Ref<DisplayLogEntry[]>
  /** 实时日志条目 */
  liveEntries: Ref<LiveLogEntry[]>
  /** 当前会话 title，与 chat/stream 请求体一致 */
  currentSessionTitle: Ref<string>
  /** 加载指定会话的历史日志 */
  loadHistory: (projectId: number, title?: string) => Promise<void>
  /**
   * 切换会话：更新 title、清空实时日志并加载历史
   * @param projectId 项目 id
   * @param title 会话标题
   */
  switchSession: (projectId: number, title: string) => Promise<void>
  /** 追加 AI 文本片段 */
  appendAiText: (text: string, projectId: number) => void
  /** 工具开始执行 */
  handleToolStart: (data: string, projectId: number) => void
  /** 工具执行完毕 */
  handleToolEnd: (data: string, projectId: number) => Promise<void>
  /** AI 流式回复正常结束 */
  finalizeAiStream: (projectId: number) => Promise<void>
  /** AI 回复被中断 */
  handleAiAbort: (projectId: number) => Promise<void>
  /** 清空实时日志 */
  clearLiveEntries: () => void
}

/** 日志上下文注入 key */
export const logContextKey: InjectionKey<LogContext> = Symbol('logContext')

/** 日志 id 自增种子 */
let logIdSeed = 0

/**
 * 生成唯一日志 id
 */
function createLogId(): string {
  logIdSeed += 1
  return `log-${logIdSeed}`
}

/**
 * 创建日志上下文（在 Builder 根组件中初始化）
 */
export function createLogContext(): LogContext {
  const historyEntries = ref<DisplayLogEntry[]>([])
  const liveEntries = ref<LiveLogEntry[]>([])
  /** 当前会话 title，与 chat/stream 保持一致 */
  const currentSessionTitle = ref('')

  /** 当前流式 AI 日志 id */
  let currentAiEntryId: string | null = null
  /** 当前执行中的工具日志 id */
  let pendingToolEntryId: string | null = null

  /**
   * 持久化日志到后端
   * @param content 日志内容
   * @param projectId 项目 id
   */
  async function persistLog(content: string, projectId: number) {
    const title = currentSessionTitle.value.trim()
    if (!projectId || !content.trim() || !title) return
    try {
      await addLog({ content, projectId, title })
    } catch {
      // 日志上报失败不阻断主流程
    }
  }

  /**
   * 结束当前 AI 流式日志并上报
   * @param projectId 项目 id
   */
  async function finalizeCurrentAiEntry(projectId: number) {
    if (!currentAiEntryId) return

    const entry = liveEntries.value.find((item) => item.id === currentAiEntryId)
    if (!entry || entry.prefix !== 'ai') {
      currentAiEntryId = null
      return
    }

    entry.streaming = false
    entry.expanded = false
    const content = entry.content.trim()
    currentAiEntryId = null

    if (content) {
      await persistLog(`[ai] ${content}`, projectId)
    }
  }

  /**
   * 加载指定会话的历史日志
   * @param projectId 项目 id
   * @param title 会话标题，不传时使用 currentSessionTitle
   */
  async function loadHistory(projectId: number, title?: string) {
    if (!projectId) {
      historyEntries.value = []
      return
    }

    const sessionTitle = (title ?? currentSessionTitle.value).trim()
    if (!sessionTitle) {
      historyEntries.value = []
      return
    }

    try {
      const list = await getLogList({ projectId, title: sessionTitle })
      historyEntries.value = list
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((item, index) => parsePersistedLogLine(item.content, index, item.createdAt))
    } catch {
      historyEntries.value = []
    }
  }

  /**
   * 切换会话时同步日志面板
   * @param projectId 项目 id
   * @param title 会话标题
   */
  async function switchSession(projectId: number, title: string) {
    currentSessionTitle.value = title.trim()
    clearLiveEntries()
    await loadHistory(projectId, title.trim())
  }

  /**
   * 追加 AI 文本到日志面板
   * @param text 文本片段
   * @param projectId 项目 id
   */
  function appendAiText(text: string, projectId: number) {
    if (!text || !projectId) return

    if (!currentAiEntryId) {
      const id = createLogId()
      currentAiEntryId = id
      liveEntries.value.push({
        id,
        prefix: 'ai',
        content: text,
        createdAt: new Date().toISOString(),
        streaming: true,
      })
      return
    }

    const entry = liveEntries.value.find((item) => item.id === currentAiEntryId)
    if (entry?.prefix === 'ai') {
      entry.content += text
    }
  }

  /**
   * 处理工具开始事件
   * @param data SSE 数据
   * @param projectId 项目 id
   */
  function handleToolStart(data: string, projectId: number) {
    if (!projectId) return

    void finalizeCurrentAiEntry(projectId)

    const parsed = parseToolStart(data)
    const toolName = parsed?.toolName ?? '未知工具'
    const params = parsed?.params ?? ''

    const id = createLogId()
    pendingToolEntryId = id

    const entry: ToolLogEntry = {
      id,
      prefix: 'tool',
      content: `正在执行工具: ${toolName}`,
      toolName,
      params,
      status: 'loading',
      expanded: false,
      createdAt: new Date().toISOString(),
    }
    liveEntries.value.push(entry)
  }

  /**
   * 处理工具结束事件
   * @param data SSE 数据
   * @param projectId 项目 id
   */
  async function handleToolEnd(data: string, projectId: number) {
    if (!projectId) return

    const parsed = parseToolEnd(data)
    if (!parsed) return

    let targetEntry: ToolLogEntry | undefined

    if (pendingToolEntryId) {
      const entry = liveEntries.value.find((item) => item.id === pendingToolEntryId)
      if (entry?.prefix === 'tool') {
        targetEntry = entry
      }
    }

    if (!targetEntry) {
      targetEntry = [...liveEntries.value]
        .reverse()
        .find((item): item is ToolLogEntry => item.prefix === 'tool' && item.status === 'loading' && item.toolName === parsed.toolName)
    }

    if (!targetEntry) {
      const id = createLogId()
      targetEntry = {
        id,
        prefix: 'tool',
        content: `正在执行工具: ${parsed.toolName}`,
        toolName: parsed.toolName,
        params: '',
        status: 'loading',
        expanded: false,
        createdAt: new Date().toISOString(),
      }
      liveEntries.value.push(targetEntry)
    }

    targetEntry.result = parsed.result
    targetEntry.status = parsed.success ? 'success' : 'error'
    targetEntry.content = `正在执行工具: ${parsed.toolName}`
    pendingToolEntryId = null

    const logContent = buildToolLogContent(parsed.toolName, targetEntry.params, parsed.result, parsed.success)
    await persistLog(logContent, projectId)

    // 文件写入/删除类工具成功后同步到 WebContainer 预览
    if (parsed.success) {
      if (parsed.toolName === WRITE_FILE_CONTENT_TOOL) {
        await syncWriteFileContentToPreview(targetEntry.params)
      } else if (parsed.toolName === UPSERT_FILE_TOOL) {
        await syncUpsertFileToPreview(parsed.result)
      } else if (parsed.toolName === DELETE_FILE_TOOL) {
        await syncDeleteFileToPreview(targetEntry.params)
      }
    }
  }

  /**
   * AI 流式回复正常结束
   * @param projectId 项目 id
   */
  async function finalizeAiStream(projectId: number) {
    await finalizeCurrentAiEntry(projectId)

    const loadingTools = liveEntries.value.filter(
      (item): item is ToolLogEntry => item.prefix === 'tool' && item.status === 'loading',
    )
    for (const tool of loadingTools) {
      tool.status = 'aborted'
    }
    pendingToolEntryId = null
  }

  /**
   * AI 回复被用户中断
   * @param projectId 项目 id
   */
  async function handleAiAbort(projectId: number) {
    await finalizeCurrentAiEntry(projectId)

    const loadingTools = liveEntries.value.filter(
      (item): item is ToolLogEntry => item.prefix === 'tool' && item.status === 'loading',
    )

    for (const tool of loadingTools) {
      tool.status = 'aborted'
      tool.result = 'AI 回复已中断，工具未返回结果'
      const logContent = buildToolLogContent(tool.toolName, tool.params, tool.result, false)
      await persistLog(logContent, projectId)
    }

    pendingToolEntryId = null

    const abortContent = '[ai] AI 回复已中断'
    liveEntries.value.push({
      id: createLogId(),
      prefix: 'ai',
      content: 'AI 回复已中断',
      createdAt: new Date().toISOString(),
    })
    await persistLog(abortContent, projectId)
  }

  /**
   * 清空实时日志
   */
  function clearLiveEntries() {
    liveEntries.value = []
    currentAiEntryId = null
    pendingToolEntryId = null
  }

  return {
    historyEntries,
    liveEntries,
    currentSessionTitle,
    loadHistory,
    switchSession,
    appendAiText,
    handleToolStart,
    handleToolEnd,
    finalizeAiStream,
    handleAiAbort,
    clearLiveEntries,
  }
}

/**
 * 获取日志上下文
 */
export function useLogContext(): LogContext {
  const context = inject(logContextKey)
  if (!context) {
    throw new Error('logContext 未注入')
  }
  return context
}
