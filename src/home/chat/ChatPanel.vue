<script setup lang="ts">
import { nextTick, ref } from 'vue'
import ChatMessageItem, { type ChatMessage } from './ChatMessageItem.vue'
import { mockChatSseStream } from './mockChatSse'

defineOptions({
  name: 'ChatPanel',
})

/** 消息列表 */
const messages = ref<ChatMessage[]>([])

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

/** 消息 id 自增计数 */
let messageIdSeed = 0

/**
 * 生成唯一消息 id
 */
function createMessageId(): string {
  messageIdSeed += 1
  return `msg-${messageIdSeed}`
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

  messages.value.push({
    id: createMessageId(),
    role: 'user',
    content: text,
  })
  inputText.value = ''
  await scrollToBottom()

  const assistantId = createMessageId()
  messages.value.push({
    id: assistantId,
    role: 'assistant',
    content: '',
    streaming: true,
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
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void handleSend()
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
    <div ref="messagesRef" class="chat-panel-messages">
      <div v-if="messages.length === 0" class="chat-panel-empty">开始与 AI 对话吧</div>
      <ChatMessageItem v-for="message in messages" :key="message.id" :message="message" />
    </div>

    <div class="chat-panel-input-area">
      <textarea
        v-model="inputText"
        class="chat-panel-input"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        rows="3"
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
  padding: 0.75rem 1rem 1rem;
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
