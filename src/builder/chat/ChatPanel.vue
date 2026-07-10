<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createSession, getSessionList, type sessionItem } from '@/http/session'
import { useProjectStore } from '@/stores/project'
import { PENDING_SESSION_ID, useSessionContext } from '@/builder/session/sessionContext'
import ChatMessageItem from './ChatMessageItem.vue'
import type { ChatMessage } from './types'
import { chatWithAI } from '@/http/chat'
import { uploadImageToCos } from '@/http/cos'
import { getUserInfo } from '@/http/user'
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

/** 待发送图片项 */
interface PendingChatImage {
  /** 本地唯一 id */
  id: string
  /** COS 访问地址，上传完成后赋值 */
  cosUrl: string
  /** 本地 blob 预览地址，上传完成后释放 */
  blobUrl: string
  /** 是否上传中 */
  uploading: boolean
}

/** 待发送的图片列表 */
const pendingImages = ref<PendingChatImage[]>([])

/** 是否存在上传中的图片 */
const hasUploadingImage = computed(() => pendingImages.value.some((item) => item.uploading))

/** 待发送图片 id 自增 */
let pendingImageIdSeed = 0

/** 当前用户账号，用于 COS uploads/{account} 路径 */
const userAccount = ref('')

/** 隐藏的文件选择器 */
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 允许上传的图片 MIME 类型 */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** 单张图片大小上限（10MB） */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

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
 * 释放单张图片的 blob 预览地址
 * @param image 待发送图片
 */
function revokePendingImageBlob(image: PendingChatImage) {
  if (image.blobUrl) {
    URL.revokeObjectURL(image.blobUrl)
    image.blobUrl = ''
  }
}

/**
 * 释放待发送图片的 blob 预览地址
 * @param images 待释放图片列表
 */
function revokePendingImagePreviews(images: PendingChatImage[]) {
  for (const image of images) {
    revokePendingImageBlob(image)
  }
}

/**
 * 生成待发送图片本地 id
 */
function createPendingImageId(): string {
  pendingImageIdSeed += 1
  return `pending-image-${pendingImageIdSeed}`
}

/**
 * 清空待发送图片
 */
function clearPendingImages() {
  revokePendingImagePreviews(pendingImages.value)
  pendingImages.value = []
}

/**
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
  if (!content) return null

  return {
    id: String(item.id),
    role: 'assistant',
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
    clearPendingImages()
    sessionTitle.value = ''
    backendSessionTitle.value = ''
    return
  }

  const sessionId = sessionContext.activeSessionId.value
  if (!sessionId || sessionId === PENDING_SESSION_ID) {
    stopStreaming()
    messages.value = []
    inputText.value = ''
    clearPendingImages()
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

onMounted(async () => {
  try {
    const userInfo = await getUserInfo()
    userAccount.value = userInfo.account
  } catch {
    // 错误提示由 axios 拦截器统一处理
  }
})

/**
 * 将待发送图片转为 Markdown 片段
 * @param urls 图片 URL 列表
 */
function buildImageMarkdown(urls: string[]): string {
  return urls.map((url) => `![图片](${url})`).join('\n')
}

/**
 * 拼接文本与图片 Markdown，作为最终发送内容
 * @param text 用户输入文本
 * @param imageUrls 已上传图片 URL
 */
function buildMessageContent(text: string, imageUrls: string[]): string {
  const imageMarkdown = buildImageMarkdown(imageUrls)
  return [text, imageMarkdown].filter(Boolean).join('\n\n')
}

/**
 * 打开图片选择器
 */
function handleUploadClick() {
  if (isStreaming.value) return
  fileInputRef.value?.click()
}

/**
 * 处理图片选择并上传到 COS
 * @param event 文件选择事件
 */
async function handleImageSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''

  if (!file) return

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    ElMessage.warning('仅支持 JPG、PNG、GIF、WebP 格式图片')
    return
  }

  if (file.size > MAX_IMAGE_SIZE) {
    ElMessage.warning('单张图片不能超过 10MB')
    return
  }

  if (!userAccount.value) {
    ElMessage.warning('用户信息未就绪，请稍后重试')
    return
  }

  const pendingId = createPendingImageId()
  const pendingItem: PendingChatImage = {
    id: pendingId,
    cosUrl: '',
    blobUrl: URL.createObjectURL(file),
    uploading: true,
  }
  pendingImages.value.push(pendingItem)

  try {
    const result = await uploadImageToCos(file, userAccount.value)
    console.log('[COS Upload] 上传完成', {
      url: result.url,
      key: result.key,
    })

    const target = pendingImages.value.find((item) => item.id === pendingId)
    if (!target) return

    target.cosUrl = result.url
    target.uploading = false
    revokePendingImageBlob(target)
  } catch (error) {
    const failedIndex = pendingImages.value.findIndex((item) => item.id === pendingId)
    if (failedIndex >= 0) {
      removePendingImage(failedIndex)
    }
    ElMessage.error(error instanceof Error ? error.message : '图片上传失败，请重试')
  }
}

/**
 * 移除待发送图片
 * @param index 图片索引
 */
function removePendingImage(index: number) {
  const [removed] = pendingImages.value.splice(index, 1)
  if (removed) {
    revokePendingImageBlob(removed)
  }
}

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
  const imageUrls = pendingImages.value.filter((item) => item.cosUrl).map((item) => item.cosUrl)
  const content = buildMessageContent(text, imageUrls)

  if (!content || isStreaming.value || hasUploadingImage.value) return

  const isPending = sessionContext.isPendingNewSession.value
  const hasNoSession = !sessionContext.activeSessionId.value || sessionContext.activeSessionId.value === PENDING_SESSION_ID
  const needsCreateSession = isPending || hasNoSession

  try {
    if (needsCreateSession) {
      await createSessionOnFirstMessage(content)
      await loadSessionMessages()
    } else {
      await saveMessageToSession('user', content)
      messages.value.push({
        id: createMessageId(),
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      })
    }
  } catch {
    // 错误提示由 axios 拦截器统一处理
    return
  }

  inputText.value = ''
  clearPendingImages()
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
  const finalPrompt = buildChatPrompt(content, appearanceConfig)

  console.log('[ChatPrompt]', {
    userInput: content,
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

onUnmounted(() => {
  clearPendingImages()
})

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
        <div v-if="pendingImages.length > 0" class="chat-panel-image-preview">
          <div
            v-for="(image, index) in pendingImages"
            :key="image.id"
            class="chat-panel-image-preview-item"
            :class="{ 'chat-panel-image-preview-item--uploading': image.uploading }"
          >
            <img
              :src="image.uploading ? image.blobUrl : image.cosUrl"
              :crossorigin="image.uploading ? undefined : 'anonymous'"
              alt="待发送图片"
            />
            <div v-if="image.uploading" class="chat-panel-image-loading">
              <span class="chat-panel-image-loading-spinner" aria-label="上传中" />
            </div>
            <button
              type="button"
              class="chat-panel-image-remove"
              title="移除图片"
              :disabled="isStreaming || image.uploading"
              @click="removePendingImage(index)"
            >
              ×
            </button>
          </div>
        </div>
        <input ref="fileInputRef" type="file" accept="image/jpeg,image/png,image/gif,image/webp" class="chat-panel-file-input" @change="handleImageSelect" />
        <div class="chat-panel-input-body">
          <textarea
            v-model="inputText"
            class="chat-panel-input"
            placeholder="输入消息，Enter 换行， Ctrl+Enter 发送"
            rows="5"
            :disabled="isStreaming"
            @keydown="handleInputKeydown"
          />
          <div class="chat-panel-input-footer">
            <button
              type="button"
              class="chat-panel-upload-btn"
              :class="{ 'chat-panel-upload-btn--loading': hasUploadingImage }"
              title="上传图片"
              :disabled="isStreaming"
              @click="handleUploadClick"
            >
              <span v-if="hasUploadingImage" class="chat-panel-upload-spinner" aria-label="上传中" />
              <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              class="chat-panel-action-btn"
              :class="{ 'chat-panel-action-btn--stop': isStreaming }"
              :title="isStreaming ? '终止' : '发送'"
              :disabled="hasUploadingImage"
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

.chat-panel-file-input {
  display: none;
}

.chat-panel-image-preview {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem 0;
  border-radius: calc(1.125rem - 2px) calc(1.125rem - 2px) 0 0;
  background-color: var(--chat-input-bg);
}

.chat-panel-input-body {
  position: relative;
  z-index: 1;
  border-radius: calc(1.125rem - 2px);
  background-color: var(--chat-input-bg);
}

.chat-panel-input-shell:has(.chat-panel-image-preview) .chat-panel-input-body {
  border-radius: 0 0 calc(1.125rem - 2px) calc(1.125rem - 2px);
}

.chat-panel-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.625rem 0.625rem;
}

.chat-panel-image-preview-item {
  position: relative;
  width: 4rem;
  height: 4rem;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--app-border);
}

.chat-panel-image-preview-item img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-panel-image-preview-item--uploading img {
  opacity: 0.72;
}

.chat-panel-image-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.28);
}

.chat-panel-image-loading-spinner {
  display: inline-block;
  width: 1.125rem;
  height: 1.125rem;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: chat-upload-spin 0.8s linear infinite;
}

.chat-panel-image-remove {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  width: 1.125rem;
  height: 1.125rem;
  border: none;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.875rem;
  line-height: 1;
  cursor: pointer;
}

.chat-panel-image-remove:disabled {
  cursor: not-allowed;
  opacity: 0.5;
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
  border-radius: calc(1.125rem - 2px) calc(1.125rem - 2px) 0 0;
  padding: 0.75rem 0.875rem 0.375rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--app-text-primary);
  background-color: transparent;
  outline: none;
  font-family: auto;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  transition: background-color 0.2s ease;
}

.chat-panel-input-shell:has(.chat-panel-image-preview) .chat-panel-input {
  border-radius: 0;
  padding-top: 0.5rem;
}

.chat-panel-input-shell:not(:has(.chat-panel-image-preview)) .chat-panel-input {
  border-radius: calc(1.125rem - 2px) calc(1.125rem - 2px) 0 0;
}

/* Chrome/Safari/Opera */
.chat-panel-input::-webkit-scrollbar {
  display: none;
}

.chat-panel-input:disabled {
  color: var(--app-text-secondary);
  cursor: not-allowed;
}

.chat-panel-input-body:has(.chat-panel-input:disabled) {
  background-color: var(--app-bg-subtle);
}

.chat-panel-upload-btn {
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.chat-panel-upload-btn svg {
  width: 1.125rem;
  height: 1.125rem;
}

.chat-panel-upload-btn:hover:not(:disabled) {
  background-color: var(--app-bg-subtle);
  color: var(--app-accent);
}

.chat-panel-upload-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.chat-panel-upload-btn--loading {
  pointer-events: none;
}

.chat-panel-upload-spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--app-border);
  border-top-color: var(--app-accent);
  border-radius: 50%;
  animation: chat-upload-spin 0.8s linear infinite;
}

@keyframes chat-upload-spin {
  to {
    transform: rotate(360deg);
  }
}

.chat-panel-action-btn {
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
  flex-shrink: 0;
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

.chat-panel-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
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
