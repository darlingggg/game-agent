<script setup lang="ts">
import { computed, ref } from 'vue'
import { getAiReply } from '@/http/session'
import { AI_AVATAR_SVG, USER_AVATAR_SVG } from './chatAvatars'
import MarkdownContent from './MarkdownContent.vue'
import type { ChatMessage } from './types'

defineOptions({
  name: 'ChatMessageItem',
})

export type { ChatMessage, ChatRole } from './types'

const props = defineProps<{
  message: ChatMessage
}>()

/** 是否为当前用户消息 */
const isUser = computed(() => props.message.role === 'user')

/** 当前消息头像 SVG */
const avatarSvg = computed(() => (isUser.value ? USER_AVATAR_SVG : AI_AVATAR_SVG))

/** 悬浮时展示的时间文案 */
const displayTime = computed(() => {
  if (!props.message.createdAt) return ''
  const date = new Date(props.message.createdAt)
  if (Number.isNaN(date.getTime())) return props.message.createdAt
  return date.toLocaleString('zh-CN', { hour12: false })
})

/** 流式输出中且尚无内容时展示 loading */
const showLoading = computed(() => props.message.streaming && !props.message.content)

/** 是否需要点击后懒加载 AI 回复 */
const needsLazyLoad = computed(() => !isUser.value && !props.message.streaming && !props.message.content && !!props.message.messageId)

/** Agent 回复折叠面板是否展开 */
const replyExpanded = ref(false)

/** 懒加载的 AI 回复正文 */
const replyContent = ref('')

/** 懒加载中 */
const replyLoading = ref(false)

/**
 * 切换 Agent 回复折叠面板
 */
async function toggleReply() {
  replyExpanded.value = !replyExpanded.value

  if (!replyExpanded.value || replyContent.value || replyLoading.value || !props.message.messageId) {
    return
  }

  replyLoading.value = true
  try {
    const result = await getAiReply({ id: props.message.messageId })
    replyContent.value = result.content
  } catch {
    replyExpanded.value = false
  } finally {
    replyLoading.value = false
  }
}
</script>

<template>
  <div class="chat-message" :class="{ 'chat-message--user': isUser, 'chat-message--assistant': !isUser }">
    <div v-if="!isUser" class="chat-message-avatar" v-html="avatarSvg" />
    <div class="chat-message-body">
      <div class="chat-message-bubble">
        <span v-if="showLoading" class="chat-message-loading" aria-label="加载中" />
        <template v-else-if="needsLazyLoad">
          <button type="button" class="chat-message-reply-toggle" @click="toggleReply">
            <span>Agent 回复</span>
            <svg class="chat-message-reply-arrow" :class="{ 'chat-message-reply-arrow--expanded': replyExpanded }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <div v-show="replyExpanded" class="chat-message-reply-panel">
            <span v-if="replyLoading" class="chat-message-loading" aria-label="加载中" />
            <MarkdownContent v-else :content="replyContent" />
          </div>
        </template>
        <template v-else-if="isUser">
          <span>{{ message.content }}</span>
        </template>
        <template v-else>
          <MarkdownContent :content="message.content" />
          <span v-if="message.streaming && message.content" class="chat-message-cursor" />
        </template>
        <span v-if="displayTime" class="chat-message-time" :style="{ left: isUser ? 'unset' : '0' }">{{ displayTime }}</span>
      </div>
    </div>
    <div v-if="isUser" class="chat-message-avatar" v-html="avatarSvg" />
  </div>
</template>

<style scoped>
.chat-message {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.5rem 0;
}

.chat-message--user {
  flex-direction: row;
  justify-content: flex-end;
}

.chat-message--assistant {
  flex-direction: row;
  justify-content: flex-start;
}

.chat-message-avatar {
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-message--assistant .chat-message-avatar {
  background-color: transparent;
  color: #374151;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.chat-message--assistant .chat-message-avatar :deep(svg) {
  display: block;
  width: 68%;
  height: 68%;
}

.chat-message--user .chat-message-avatar {
  background-color: transparent;
  border: 2px solid var(--app-accent);
}

.chat-message--user .chat-message-avatar :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

html.dark .chat-message--assistant .chat-message-avatar {
  color: #e8eaed;
  border-color: rgba(255, 255, 255, 0.12);
}

.chat-message-body {
  max-width: 75%;
  min-width: 0;
}

.chat-message-bubble {
  position: relative;
  padding: 0.625rem 0.875rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}

.chat-message--user .chat-message-bubble {
  background-color: var(--app-bg-subtle);
  color: var(--app-text-primary);
}

.chat-message--assistant .chat-message-bubble {
  color: var(--app-text-primary);
  background-color: var(--app-surface);
  border: 1px solid var(--app-border);
  font-size: 0.8125rem;
  white-space: normal;
}

html.dark .chat-message--user .chat-message-bubble {
  background-color: rgba(91, 140, 255, 0.1);
  border: 1px solid rgba(91, 140, 255, 0.14);
}

.chat-message-reply-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--app-accent);
  font-size: 0.875rem;
  cursor: pointer;
}

.chat-message-reply-arrow {
  width: 1rem;
  height: 1rem;
  transition: transform 0.2s ease;
}

.chat-message-reply-arrow--expanded {
  transform: rotate(180deg);
}

.chat-message-reply-panel {
  font-size: 0.8125rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--app-border);
  color: var(--app-text-primary);
  word-break: break-word;
}

.chat-message-time {
  position: absolute;
  right: 0;
  bottom: 0;
  transform: translateY(100%);
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  color: var(--app-text-secondary);
  font-size: 0.6rem;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.chat-message-bubble:hover .chat-message-time {
  opacity: 1;
}

.chat-message-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background-color: currentColor;
  animation: chat-cursor-blink 1s step-end infinite;
}

.chat-message-loading {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid #e5e7eb;
  border-top-color: #2463dc;
  border-radius: 50%;
  animation: chat-message-spin 0.8s linear infinite;
}

@keyframes chat-message-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes chat-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>
