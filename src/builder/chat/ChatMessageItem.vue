<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AI_AVATAR_URL } from './chatAvatars'
import SvgIcon from '@/components/SvgIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import MarkdownContent from './MarkdownContent.vue'
import type { ChatMessage } from './types'

defineOptions({
  name: 'ChatMessageItem',
})

export type { ChatMessage, ChatRole } from './types'

const props = defineProps<{
  message: ChatMessage
  userAvatar?: string | null
}>()

/** 是否为当前用户消息 */
const isUser = computed(() => props.message.role === 'user')

/** 悬浮时展示的时间文案 */
const displayTime = computed(() => {
  if (!props.message.createdAt) return ''
  const date = new Date(props.message.createdAt)
  if (isNaN(date.getTime())) return props.message.createdAt
  return date.toLocaleString('zh-CN', { hour12: false })
})

const hasVisionReasoning = computed(() => !!props.message.vision?.reasoning.trim())

const hasVisionAnswer = computed(() => !!props.message.vision?.answer.trim())

const hasVisionContent = computed(() => hasVisionReasoning.value || hasVisionAnswer.value || !!props.message.vision?.streaming)

/** 流式输出中且尚无内容时展示 loading */
const showLoading = computed(() => props.message.streaming && !props.message.content && !hasVisionContent.value)

/** AI 回复是否可折叠（流式结束后且有正文） */
const canCollapse = computed(() => !isUser.value && !props.message.streaming && (!!props.message.content.trim() || hasVisionContent.value))

/** AI 回复折叠面板是否展开 */
const replyExpanded = ref(!!props.message.streaming)

/** 图像思考区块是否展开，默认折叠 */
const visionReasoningExpanded = ref(false)

/** 是否展示 AI 回复正文 */
const showReplyContent = computed(() => props.message.streaming || replyExpanded.value)

/** 用户消息 Markdown 图片语法 */
const USER_IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\(([^)]+)\)/g

/**
 * 从用户消息正文中拆分文本与图片 URL
 * @param content 消息正文
 */
function parseUserMessageContent(content: string): { text: string; imageUrls: string[] } {
  const imageUrls: string[] = []
  const text = content
    .replace(USER_IMAGE_MARKDOWN_RE, (_, url: string) => {
      imageUrls.push(url.trim())
      return ''
    })
    .replace(/\n{2,}/g, '\n\n')
    .trim()

  return { text, imageUrls }
}

/** 用户消息拆分结果（文本 + 图片 URL） */
const userMessageParts = computed(() => {
  if (!isUser.value) {
    return { text: '', imageUrls: [] as string[] }
  }
  return parseUserMessageContent(props.message.content)
})

/** 用户消息是否包含图片 */
const hasUserImages = computed(() => userMessageParts.value.imageUrls.length > 0)

watch(
  () => props.message.streaming,
  (streaming) => {
    if (streaming) {
      replyExpanded.value = true
    }
  },
)

/**
 * 切换 AI 回复折叠状态
 */
function toggleReply() {
  replyExpanded.value = !replyExpanded.value
}

/**
 * 切换图像思考折叠状态
 */
function toggleVisionReasoning() {
  visionReasoningExpanded.value = !visionReasoningExpanded.value
}
</script>

<template>
  <div class="chat-message" :class="{ 'chat-message--user': isUser, 'chat-message--assistant': !isUser }">
    <div v-if="!isUser" class="chat-message-avatar"><img :src="AI_AVATAR_URL" alt="" /></div>
    <div class="chat-message-body">
      <div class="chat-message-bubble">
        <span v-if="showLoading" class="chat-message-loading" aria-label="加载中" />
        <template v-else-if="isUser">
          <div class="chat-message-user-content">
            <div v-if="userMessageParts.text" class="chat-message-user-text">
              <MarkdownContent :content="userMessageParts.text" />
            </div>
            <div v-if="hasUserImages" class="chat-message-user-images">
              <img
                v-for="(url, index) in userMessageParts.imageUrls"
                :key="`${url}-${index}`"
                :src="url"
                crossorigin="anonymous"
                alt="图片"
              />
            </div>
          </div>
        </template>
        <template v-else>
          <button v-if="canCollapse" type="button" class="chat-message-reply-toggle" @click="toggleReply">
            <span>Agent 回复</span>
            <SvgIcon name="chevron-down" class="chat-message-reply-arrow" :class="{ 'chat-message-reply-arrow--expanded': replyExpanded }" />
          </button>
          <div v-show="showReplyContent" class="chat-message-reply-panel" :class="{ 'chat-message-reply-panel--flat': !canCollapse }">
            <div v-if="hasVisionContent" class="chat-message-vision">
              <div v-if="hasVisionReasoning" class="chat-message-vision-section">
                <button type="button" class="chat-message-vision-toggle" @click="toggleVisionReasoning">
                  <span>图像思考</span>
                  <SvgIcon
                    name="chevron-down"
                    class="chat-message-reply-arrow"
                    :class="{ 'chat-message-reply-arrow--expanded': visionReasoningExpanded }"
                  />
                </button>
                <div v-show="visionReasoningExpanded" class="chat-message-vision-content">
                  <MarkdownContent :content="message.vision?.reasoning ?? ''" />
                </div>
              </div>
              <div v-if="hasVisionAnswer" class="chat-message-vision-section">
                <div class="chat-message-vision-title">图像理解</div>
                <MarkdownContent :content="message.vision?.answer ?? ''" />
              </div>
              <div v-if="message.vision?.streaming" class="chat-message-vision-running">
                <span class="chat-message-loading chat-message-loading--small" aria-label="识别中" />
                <span>图像识别中</span>
              </div>
            </div>
            <MarkdownContent v-if="message.content" :content="message.content" />
            <span v-if="message.streaming && message.content" class="chat-message-cursor" />
          </div>
        </template>
        <span v-if="displayTime" class="chat-message-time" :style="{ left: isUser ? 'unset' : '0' }">{{ displayTime }}</span>
      </div>
    </div>
    <div v-if="isUser" class="chat-message-avatar"><UserAvatar :avatar="userAvatar" /></div>
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

.chat-message--assistant .chat-message-avatar img {
  display: block;
  width: 68%;
  height: 68%;
}

.chat-message--user .chat-message-avatar {
  background-color: transparent;
  border: 2px solid var(--app-accent);
}

.chat-message--user .chat-message-avatar img {
  display: block;
  width: 100%;
  height: 100%;
}

.chat-message--user .chat-message-avatar :deep(.user-avatar-image--fallback) {
  width: 68%;
  height: 68%;
}

html.dark .chat-message--assistant .chat-message-avatar {
  color: #e8eaed;
  border-color: rgba(255, 255, 255, 0.12);
}

html.dark .chat-message--assistant .chat-message-avatar img {
  filter: invert(1);
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
  white-space: normal;
  width: fit-content;
  max-width: 100%;
}

.chat-message-user-content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.375rem;
  max-width: 100%;
}

.chat-message-user-text {
  width: fit-content;
  max-width: 100%;
}

.chat-message-user-text :deep(.markdown-content p) {
  margin: 0;
}

.chat-message-user-images {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  justify-content: flex-start;
  max-width: 100%;
}

.chat-message-user-images img {
  display: block;
  width: 3.5rem;
  height: 3.5rem;
  object-fit: cover;
  border-radius: 0.625rem;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background-color: rgba(0, 0, 0, 0.04);
}

html.dark .chat-message-user-images img {
  border-color: rgba(255, 255, 255, 0.12);
  background-color: rgba(255, 255, 255, 0.04);
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

.chat-message-reply-panel--flat {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.chat-message-vision {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin-bottom: 0.625rem;
  padding: 0.625rem;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background-color: var(--app-bg-subtle);
  color: var(--app-text-secondary);
}

.chat-message-vision-section + .chat-message-vision-section {
  padding-top: 0.625rem;
  border-top: 1px solid var(--app-border);
}

.chat-message-vision-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--app-text-primary);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.4;
  cursor: pointer;
}

.chat-message-vision-content {
  margin-top: 0.25rem;
}

.chat-message-vision-running {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--app-text-secondary);
  font-size: 0.75rem;
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

.chat-message-loading--small {
  width: 0.75rem;
  height: 0.75rem;
  border-width: 1.5px;
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
