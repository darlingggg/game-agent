<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { nextTick, ref, watch } from 'vue'
import { createSession, getSessionList, type sessionItem } from '@/http/session'
import { useProjectStore } from '@/stores/project'
import { PENDING_SESSION_ID, useSessionContext } from '@/builder/session/sessionContext'
import ChatMessageItem from './ChatMessageItem.vue'
import type { ChatMessage } from './types'
import { mockChatSseStream } from './mockChatSse'

defineOptions({
  name: 'ChatPanel',
})

const projectStore = useProjectStore()
const sessionContext = useSessionContext()

/** 消息列表 */
const messages = ref<ChatMessage[]>([])

/** 消息加载中 */
const messagesLoading = ref(false)

/** 输入框内容 */
const inputText = ref('')

/** 是否正在流式回复 */
const isStreaming = ref(false)

/** 消息列表容器，用于滚动到底部 */
const messagesRef = ref<HTMLElement | null>(null)

/** 当前 SSE 中止控制器 */
let abortController: AbortController | null = null

/** 当前流式回复中的 AI 消息 id */
let streamingAssistantId: string | null = null

/** 消息 id 自增计数（本地临时消息） */
let messageIdSeed = 0

/** 当前项目 ID */
const projectId = () => projectStore.currentProject?.id ?? 0

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
  const content = item.content?.trim()
  if (!content) return null

  return {
    id: String(item.messageId ?? `${item.id}-${item.createdAt}`),
    role: item.role === 'user' ? 'user' : 'assistant',
    content,
    createdAt: item.createdAt,
  }
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
    return
  }

  const sessionId = sessionContext.activeSessionId.value
  if (!sessionId || sessionId === PENDING_SESSION_ID) {
    stopStreaming()
    messages.value = []
    return
  }

  const currentProjectId = projectId()
  if (!currentProjectId) return

  messagesLoading.value = true
  try {
    const list = await getSessionList({ projectId: currentProjectId })
    const sessionMessages = pickSessionMessages(list, sessionId)
      .map(mapSessionItemToMessage)
      .filter((item): item is ChatMessage => !!item)
      .sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())

    messages.value = sessionMessages
    await scrollToBottom()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '消息加载失败')
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
 * 首条消息时创建会话（不传 title）
 * @param text 用户首条消息
 */
async function createSessionOnFirstMessage(text: string) {
  const currentProjectId = projectId()
  if (!currentProjectId) {
    throw new Error('项目未就绪')
  }

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
  abortController?.abort()
  abortController = null
  isStreaming.value = false

  if (streamingAssistantId) {
    finishAssistantStreaming(streamingAssistantId)
    streamingAssistantId = null
  }
}

/**
 * 发送用户消息并模拟 SSE 回显
 */
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  const isPending = sessionContext.isPendingNewSession.value

  try {
    if (isPending) {
      await createSessionOnFirstMessage(text)
      await loadSessionMessages()
    } else {
      messages.value.push({
        id: createMessageId(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      })
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '会话创建失败')
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
  await scrollToBottom()

  isStreaming.value = true
  abortController = new AbortController()

  try {
    await mockChatSseStream({
      text,
      signal: abortController.signal,
      onChunk: (chunk) => {
        const assistantMessage = findMessageById(assistantId)
        if (!assistantMessage) return
        assistantMessage.content += chunk
        void scrollToBottom()
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
    streamingAssistantId = null
    abortController = null
    isStreaming.value = false
    await scrollToBottom()
  }
}

/**
 * 输入框按键：Enter 发送，Shift+Enter 换行
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
      <textarea v-model="inputText" class="chat-panel-input" placeholder="输入消息，Enter 换行， Ctrl+Enter 发送" rows="5" :disabled="isStreaming" @keydown="handleInputKeydown" />
      <button type="button" class="chat-panel-action-btn" :class="{ 'chat-panel-action-btn--stop': isStreaming }" :title="isStreaming ? '终止' : '发送'" @click="handleActionClick">
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
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  overflow: hidden;
  background-color: #fff;
}

.chat-panel-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
}

.chat-panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #000;
  font-size: 1rem;
  font-weight: 700;
}

.chat-panel-input-area {
  position: relative;
  flex-shrink: 0;
  border-top: 1px solid #e5e5e5;
  background-color: #fcfcfd;
  padding: 0.75rem 1rem;
}

.chat-panel-input {
  width: 100%;
  resize: none;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 0.75rem 3rem 0.75rem 0.875rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #111827;
  background-color: #fff;
  outline: none;
  transition: border-color 0.2s ease;
  font-family: auto;
}

.chat-panel-input {
  overflow: auto;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

/* Chrome/Safari/Opera */
.chat-panel-input::-webkit-scrollbar {
  display: none;
}

.chat-panel-input:focus {
  border-color: #2463dc;
}

.chat-panel-input:disabled {
  background-color: #f9fafb;
  color: #6b7280;
  cursor: not-allowed;
}

.chat-panel-action-btn {
  position: absolute;
  right: 1.5rem;
  bottom: 1.5rem;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #2463dc;
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
</style>
