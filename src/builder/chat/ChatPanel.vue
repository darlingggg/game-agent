<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { createSession, getSessionList, type sessionItem } from '@/http/session'
import { useProjectStore } from '@/stores/project'
import { PENDING_SESSION_ID, useSessionContext } from '@/builder/session/sessionContext'
import ChatMessageItem from './ChatMessageItem.vue'
import type { ChatMessage } from './types'
import { chatWithAI } from '@/http/chat'
import { useLogContext } from '@/builder/log/logContext'
import { buildChatPrompt, getChatAppearanceContext } from '@/builder/config/appearanceConfig'
import { useAppearanceStore } from '@/stores/appearance'

defineOptions({
  name: 'ChatPanel',
})

const projectStore = useProjectStore()
const sessionContext = useSessionContext()
const logContext = useLogContext()
const appearanceStore = useAppearanceStore()

/** 消息列表 */
const messages = ref<ChatMessage[]>([])

/** 消息加载中 */
const messagesLoading = ref(false)

/** 输入框内容 */
const inputText = ref('')

/** 是否正在流式回复 */
const isStreaming = ref(false)

/** 是否由用户主动中断 AI 回复 */
const userAborted = ref(false)

/** 消息列表容器，用于滚动到底部 */
const messagesRef = ref<HTMLElement | null>(null)

/** 当前 SSE 中止控制器 */
let abortController: AbortController | null = null

/** 当前流式回复中的 AI 消息 id */
let streamingAssistantId: string | null = null

/** 消息 id 自增计数（本地临时消息） */
let messageIdSeed = 0

/** 是否调用 AI 对话接口，确认 prompt 参数后改为 true */
const CHAT_API_ENABLED = true

/** 当前项目 ID */
const projectId = () => projectStore.currentProject?.id ?? 0

/** 当前会话标题（同一会话下的消息共用，与后端 title 字段对应） */
const sessionTitle = ref('')

/** 当前会话后端 title 字段，用于 chat/stream 等接口 */
const backendSessionTitle = ref('')

/**
 * 获取会话去重键（与 SessionPanel 保持一致）
 * @param item 会话项
 */
function getSessionKey(item: sessionItem) {
  return item.title.trim() || item.content?.trim() || String(item.id)
}

/**
 * 将接口数据转为聊天消息
 * @param item 会话项
 */
function mapSessionItemToMessage(item: sessionItem): ChatMessage | null {
  const role = item.role === 'user' ? 'user' : 'assistant'

  if (role === 'user') {
    const content = item.content?.trim()
    if (!content) return null

    return {
      id: String(item.id),
      role: 'user',
      content,
      createdAt: item.createdAt,
    }
  }

  const content = item.content?.trim() ?? ''
  if (content) {
    return {
      id: String(item.id),
      role: 'assistant',
      content,
      createdAt: item.createdAt,
    }
  }

  // assistant 正文存在 messages 表，列表里 content 为空，通过 messageId 懒加载
  if (item.messageId) {
    return {
      id: String(item.id),
      role: 'assistant',
      content: '',
      messageId: item.messageId,
      createdAt: item.createdAt,
    }
  }

  return null
}

/**
 * 从列表中筛选当前会话的消息
 * @param list 接口返回列表
 * @param sessionId 当前会话 id
 */
function pickSessionMessages(list: sessionItem[], sessionId: number) {
  const target = list.find((item) => item.id === sessionId)
  if (!target) return []

  const sessionKey = getSessionKey(target)
  return list.filter((item) => getSessionKey(item) === sessionKey || item.id === sessionId)
}

/**
 * 加载当前会话的历史消息
 */
async function loadSessionMessages() {
  if (sessionContext.isPendingNewSession.value) {
    stopStreaming()
    messages.value = []
    inputText.value = ''
    sessionTitle.value = ''
    backendSessionTitle.value = ''
    return
  }

  const sessionId = sessionContext.activeSessionId.value
  if (!sessionId || sessionId === PENDING_SESSION_ID) {
    stopStreaming()
    messages.value = []
    sessionTitle.value = ''
    backendSessionTitle.value = ''
    return
  }

  const currentProjectId = projectId()
  if (!currentProjectId) return

  messagesLoading.value = true
  try {
    const list = await getSessionList({ projectId: currentProjectId })
    const target = list.find((item) => item.id === sessionId)
    if (target) {
      sessionTitle.value = getSessionKey(target)
      backendSessionTitle.value = target.title.trim()
    }

    const sessionMessages = pickSessionMessages(list, sessionId)
      .map(mapSessionItemToMessage)
      .filter((item): item is ChatMessage => !!item)
      .sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())

    messages.value = sessionMessages
    await scrollToBottom()
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    messagesLoading.value = false
  }
}

/** 切换会话时加载历史消息 */
watch(
  () => [sessionContext.activeSessionId.value, sessionContext.isPendingNewSession.value] as const,
  () => {
    void loadSessionMessages()
  },
  { immediate: true },
)

/**
 * 首条消息时创建会话（不传 title，后端取 content 前 30 字作为 title）
 * @param text 用户首条消息
 */
async function createSessionOnFirstMessage(text: string) {
  const currentProjectId = projectId()
  if (!currentProjectId) {
    throw new Error('项目未就绪')
  }

  sessionTitle.value = text.slice(0, 30)

  const result = await createSession({
    projectId: currentProjectId,
    role: 'user',
    content: text,
  })

  sessionContext.isPendingNewSession.value = false
  sessionContext.activeSessionId.value = result.id
  sessionContext.lastCreatedSession.value = {
    id: result.id,
    content: result.content,
    firstMessage: text,
  }
}

/**
 * 生成唯一消息 id
 */
function createMessageId(): string {
  messageIdSeed += 1
  return `local-${messageIdSeed}`
}

/**
 * 滚动消息列表到底部
 */
async function scrollToBottom() {
  await nextTick()
  const el = messagesRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

/**
 * 根据 id 查找消息
 * @param messageId 消息 id
 */
function findMessageById(messageId: string): ChatMessage | undefined {
  return messages.value.find((item) => item.id === messageId)
}

/**
 * 结束指定 AI 消息的流式状态
 * @param assistantId AI 消息 id
 */
function finishAssistantStreaming(assistantId: string) {
  const assistantMessage = findMessageById(assistantId)
  if (assistantMessage) {
    assistantMessage.streaming = false
  }
}

/**
 * 停止当前 AI 流式回复
 */
function stopStreaming() {
  if (isStreaming.value) {
    userAborted.value = true
  }

  abortController?.abort()
  abortController = null
  isStreaming.value = false

  if (streamingAssistantId) {
    finishAssistantStreaming(streamingAssistantId)
    streamingAssistantId = null
  }
}

/**
 * 确保已解析当前会话 title
 */
async function ensureSessionTitle() {
  if (sessionTitle.value) return sessionTitle.value

  const sessionId = sessionContext.activeSessionId.value
  const currentProjectId = projectId()
  if (!sessionId || !currentProjectId) return ''

  const list = await getSessionList({ projectId: currentProjectId })
  const target = list.find((item) => item.id === sessionId)
  if (target) {
    sessionTitle.value = getSessionKey(target)
    backendSessionTitle.value = target.title.trim()
  }
  return sessionTitle.value
}

/**
 * 上传消息到会话
 * @param role 消息角色
 * @param content 消息内容
 */
async function saveMessageToSession(role: 'user' | 'assistant', content: string) {
  const currentProjectId = projectId()
  const trimmed = content.trim()
  if (!currentProjectId || !trimmed) return

  const title = await ensureSessionTitle()
  if (!title) return

  await createSession({
    projectId: currentProjectId,
    role,
    content: trimmed,
    title,
  })
}

/**
 * 将 AI 文本片段追加到消息气泡
 * @param assistantId AI 消息 id
 * @param text 文本片段
 */
function appendTextToMessage(assistantId: string, text: string) {
  const assistantMessage = findMessageById(assistantId)
  if (!assistantMessage) return
  assistantMessage.content += text
  void scrollToBottom()
}

/**
 * 处理 SSE 事件：对话区展示文本，日志区记录 AI/工具输出
 * @param assistantId AI 消息 id
 * @param event SSE 事件
 */
function handleSseEvent(assistantId: string, event: { event: string; data: string | null }) {
  if (!event.data) return

  const currentProjectId = projectId()

  if (event.event === 'text') {
    appendTextToMessage(assistantId, event.data)
    logContext.appendAiText(event.data, currentProjectId)
    return
  }

  if (event.event === 'tool_start') {
    logContext.handleToolStart(event.data, currentProjectId)
    return
  }

  if (event.event === 'tool_end') {
    void logContext.handleToolEnd(event.data, currentProjectId)
  }
}

/**
 * 发送用户消息
 */
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  const isPending = sessionContext.isPendingNewSession.value
  const hasNoSession = !sessionContext.activeSessionId.value || sessionContext.activeSessionId.value === PENDING_SESSION_ID
  const needsCreateSession = isPending || hasNoSession

  try {
    if (needsCreateSession) {
      await createSessionOnFirstMessage(text)
      await loadSessionMessages()
    } else {
      await saveMessageToSession('user', text)
      messages.value.push({
        id: createMessageId(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      })
    }
  } catch {
    // 错误提示由 axios 拦截器统一处理
    return
  }

  inputText.value = ''
  await scrollToBottom()

  const assistantId = createMessageId()
  messages.value.push({
    id: assistantId,
    role: 'assistant',
    content: '',
    streaming: true,
    createdAt: new Date().toISOString(),
  })
  streamingAssistantId = assistantId
  isStreaming.value = true
  userAborted.value = false
  abortController = new AbortController()
  await scrollToBottom()

  const currentProjectId = projectId()
  const chatTitle = backendSessionTitle.value.trim() || undefined
  const appearanceConfig = appearanceStore.config
  const appearanceContext = getChatAppearanceContext(appearanceConfig)
  const finalPrompt = buildChatPrompt(text, appearanceConfig)

  console.log('[ChatPrompt]', {
    userInput: text,
    appearanceContext,
    finalPrompt,
    projectId: currentProjectId,
    title: chatTitle,
  })

  if (!CHAT_API_ENABLED) {
    finishAssistantStreaming(assistantId)
    messages.value = messages.value.filter((item) => item.id !== assistantId)
    streamingAssistantId = null
    abortController = null
    isStreaming.value = false
    return
  }

  try {
    await chatWithAI({
      prompt: finalPrompt,
      projectId: currentProjectId,
      title: chatTitle,
      signal: abortController.signal,
      onEvent: (event) => {
        handleSseEvent(assistantId, event)
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    const assistantMessage = findMessageById(assistantId)
    if (assistantMessage && !assistantMessage.content) {
      assistantMessage.content = '回复失败，请重试'
    }
  } finally {
    finishAssistantStreaming(assistantId)

    if (userAborted.value) {
      await logContext.handleAiAbort(currentProjectId)
      userAborted.value = false
    } else {
      await logContext.finalizeAiStream(currentProjectId)
    }

    const assistantMessage = findMessageById(assistantId)
    if (assistantMessage?.content.trim() && assistantMessage.content !== '回复失败，请重试') {
      try {
        await saveMessageToSession('assistant', assistantMessage.content)
      } catch {
        // 错误提示由 axios 拦截器统一处理
      }
    }
    streamingAssistantId = null
    abortController = null
    isStreaming.value = false
    await scrollToBottom()
  }
}

/**
 * 输入框按键：Ctrl+Enter 发送，Enter 换行
 * @param event 键盘事件
 */
function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && event.ctrlKey) {
    event.preventDefault()
    void handleSend()
  }
}

/**
 * 右下角按钮：流式中终止，否则发送
 */
function handleActionClick() {
  if (isStreaming.value) {
    stopStreaming()
    return
  }
  void handleSend()
}
</script>

<template>
  <div class="chat-panel">
    <div ref="messagesRef" v-loading="messagesLoading" class="chat-panel-messages">
      <div v-if="!messagesLoading && messages.length === 0" class="chat-panel-empty">开始与 AI 对话吧</div>
      <ChatMessageItem v-for="message in messages" :key="message.id" :message="message" />
    </div>

    <div class="chat-panel-input-area">
      <div class="chat-panel-input-shell">
        <textarea
          v-model="inputText"
          class="chat-panel-input"
          placeholder="输入消息，Enter 换行， Ctrl+Enter 发送"
          rows="5"
          :disabled="isStreaming"
          @keydown="handleInputKeydown"
        />
        <button
          type="button"
          class="chat-panel-action-btn"
          :class="{ 'chat-panel-action-btn--stop': isStreaming }"
          :title="isStreaming ? '终止' : '发送'"
          @click="handleActionClick"
        >
          <!-- 发送图标 -->
          <svg v-if="!isStreaming" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.4 20.6L20.8 12 3.4 3.4l2.8 7.2L16 12l-9.8 1.4-2.8 7.2z" fill="currentColor" />
          </svg>
          <!-- 终止图标 -->
          <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Stitch 风格输入框：聚焦时 Google 多色渐变边框 */
.chat-panel {
  --chat-input-bg: var(--app-surface);
  --chat-input-shell-border: var(--app-border-strong);
  --chat-input-shell-focus-gradient: conic-gradient(from 0deg, #4285f4, #9b72cb, #d96570, #f4b400, #0f9d58, #4285f4);
  --chat-input-shell-focus-shadow: 0 0 0 3px rgba(66, 133, 244, 0.12), 0 4px 20px rgba(155, 114, 203, 0.14);
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--app-surface);
}

.chat-panel-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(36, 99, 220, 0.06) 0%, transparent 55%),
    radial-gradient(ellipse 60% 40% at 100% 100%, rgba(155, 114, 203, 0.04) 0%, transparent 50%), var(--app-surface);
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

.chat-panel-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-panel-messages::-webkit-scrollbar-track {
  background: var(--app-scrollbar-track);
}

.chat-panel-messages::-webkit-scrollbar-thumb {
  background-color: var(--app-scrollbar-thumb);
  border-radius: 999px;
  border: 1px solid transparent;
  background-clip: padding-box;
  transition: background-color 0.2s ease;
}

.chat-panel-messages::-webkit-scrollbar-thumb:hover {
  background-color: var(--app-scrollbar-thumb-hover);
}

.chat-panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--app-text-primary);
  font-size: 1rem;
  font-weight: 700;
}

.chat-panel-input-area {
  flex-shrink: 0;
  border-top: 1px solid var(--app-border);
  background-color: var(--app-bg-muted);
  padding: 0.75rem 1rem;
}

.chat-panel-input-shell {
  position: relative;
  padding: 2px;
  border-radius: 1.125rem;
  background: var(--chat-input-shell-border);
  overflow: hidden;
  isolation: isolate;
  transition:
    background 0.28s ease,
    box-shadow 0.28s ease;
}

.chat-panel-input-shell::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 0;
  width: 200%;
  aspect-ratio: 1;
  background: var(--chat-input-shell-focus-gradient);
  opacity: 0;
  transform: translate(-50%, -50%);
  transition: opacity 0.28s ease;
  pointer-events: none;
}

.chat-panel-input-shell:has(.chat-panel-input:focus) {
  background: transparent;
  box-shadow: var(--chat-input-shell-focus-shadow);
}

.chat-panel-input-shell:has(.chat-panel-input:focus)::before {
  opacity: 1;
  animation: chat-input-border-flow 3s linear infinite;
}

@keyframes chat-input-border-flow {
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

.chat-panel-input {
  position: relative;
  z-index: 1;
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  resize: none;
  border: none;
  border-radius: calc(1.125rem - 2px);
  padding: 0.75rem 3rem 0.75rem 0.875rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--app-text-primary);
  background-color: var(--chat-input-bg);
  outline: none;
  font-family: auto;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  transition: background-color 0.2s ease;
}

/* Chrome/Safari/Opera */
.chat-panel-input::-webkit-scrollbar {
  display: none;
}

.chat-panel-input:disabled {
  background-color: var(--app-bg-subtle);
  color: var(--app-text-secondary);
  cursor: not-allowed;
}

.chat-panel-action-btn {
  position: absolute;
  right: 0.625rem;
  bottom: 0.625rem;
  z-index: 2;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--app-accent);
  color: #fff;
  cursor: pointer;
  transform: rotate(-90deg);
  transition: background-color 0.2s ease;
}

.chat-panel-action-btn svg {
  width: 1rem;
  height: 1rem;
}

.chat-panel-action-btn:hover {
  background-color: #1d4fb8;
}

.chat-panel-action-btn--stop {
  background-color: #ef4444;
}

.chat-panel-action-btn--stop:hover {
  background-color: #dc2626;
}

html.dark .chat-panel {
  --chat-input-bg: var(--app-surface);
  --chat-input-shell-border: var(--app-border-strong);
  --chat-input-shell-focus-gradient: conic-gradient(from 0deg, #5b9bf8, #b08cf0, #e07a7f, #f7c948, #3ecf8e, #5b9bf8);
  --chat-input-shell-focus-shadow: 0 0 0 3px rgba(91, 155, 248, 0.18), 0 4px 24px rgba(176, 140, 240, 0.2);
}

html.dark .chat-panel-messages {
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(91, 140, 255, 0.1) 0%, transparent 55%),
    radial-gradient(ellipse 60% 40% at 0% 100%, rgba(138, 180, 248, 0.05) 0%, transparent 50%), linear-gradient(180deg, #12151c 0%, #0f1115 100%);
}

@media (prefers-reduced-motion: reduce) {
  .chat-panel-input-shell:has(.chat-panel-input:focus)::before {
    animation: none;
  }
}
</style>
