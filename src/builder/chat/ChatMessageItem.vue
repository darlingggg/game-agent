<script setup lang="ts">
import { computed } from 'vue'
import { AI_AVATAR_SVG, USER_AVATAR_SVG } from './chatAvatars'
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
</script>

<template>
  <div class="chat-message" :class="{ 'chat-message--user': isUser, 'chat-message--assistant': !isUser }">
    <div v-if="!isUser" class="chat-message-avatar" v-html="avatarSvg" />
    <div class="chat-message-body">
      <div class="chat-message-bubble">
        <span>{{ message.content }}</span>
        <span v-if="message.streaming && message.content" class="chat-message-cursor" />
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
  background-color: #f3f4f6;
}

.chat-message--user .chat-message-avatar {
  background-color: transparent;
  border: 2px solid #2463dc;
}

.chat-message-avatar :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.chat-message-body {
  max-width: 75%;
  min-width: 0;
}

.chat-message-bubble {
  position: relative;
  padding: 0.625rem 0.875rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}

.chat-message--user .chat-message-bubble {
  background-color: #f5f5f5;
  color: #000000e6;
  border-top-right-radius: 0.25rem;
}

.chat-message--assistant .chat-message-bubble {
  color: #000000e6;
  border: 1px solid #e5e7eb;
  border-top-left-radius: 0.25rem;
}

.chat-message-time {
  position: absolute;
  right: 0;
  bottom: 0;
  transform: translateY(100%);
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  color: #575757;
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
