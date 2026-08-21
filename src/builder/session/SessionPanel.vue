<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { DArrowLeft, Delete, Edit, Plus, Search, Sort } from '@element-plus/icons-vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { deleteConversation, getConversationList, updateConversation, type ConversationSummary } from '@/http/session'
import { useProjectStore } from '@/stores/project'
import { SESSION_EMPTY_PREVIEW } from './constants'
import { useSessionContext } from './sessionContext'

defineOptions({
  name: 'SessionPanel',
})

const router = useRouter()
const projectStore = useProjectStore()
const sessionContext = useSessionContext()

/** 用户昵称 */
/** 会话列表 */
const conversations = ref<ConversationSummary[]>([])

/** 搜索框输入值 */
const searchInput = ref('')

/** 防抖后的搜索关键词 */
const searchKeyword = ref('')

/** 搜索防抖定时器 */
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

/** 搜索防抖延迟（毫秒） */
const SEARCH_DEBOUNCE_MS = 300

/** 列表加载中 */
const listLoading = ref(false)
const loadingMore = ref(false)
const listPage = ref(1)
const listHasMore = ref(false)
const CONVERSATION_PAGE_SIZE = 30
let listRequestId = 0

/** 当前项目 ID */
const projectId = computed(() => projectStore.currentProject?.id ?? 0)

/** 当前激活会话 id */
const activeConversationId = computed(() => sessionContext.activeConversationId.value)

/** 是否处于待创建新会话状态 */
const isPendingNewSession = computed(() => sessionContext.isPendingNewSession.value)

/** 当前项目标题 */
const projectTitle = computed(() => projectStore.currentProject?.title ?? '项目名称')

/** 当前项目描述展示文案 */
const projectDesc = computed(() => {
  const desc = projectStore.currentProject?.desc?.trim() ?? ''
  return desc || '暂无描述'
})

/**
 * 获取会话标题
 * @param conversation 会话摘要
 */
function getSessionTitle(conversation: ConversationSummary) {
  return conversation.title.trim() || conversation.preview.trim() || '新会话'
}

/**
 * 获取会话预览
 * @param conversation 会话摘要
 */
function getSessionPreview(conversation: ConversationSummary) {
  return conversation.preview.trim() || SESSION_EMPTY_PREVIEW
}

/**
 * 格式化会话时间（HH:mm）
 * @param value 接口返回的时间字符串
 */
function formatSessionTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * 搜索输入防抖处理
 */
function handleSearchInput() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  searchDebounceTimer = setTimeout(() => {
    searchKeyword.value = searchInput.value
  }, SEARCH_DEBOUNCE_MS)
}

/** 加载会话摘要列表；继续加载时追加下一页。 */
async function fetchConversationList(reset = true) {
  if (!projectId.value) return
  if (!reset && (!listHasMore.value || loadingMore.value)) return
  const requestId = ++listRequestId
  const page = reset ? 1 : listPage.value + 1
  if (reset) listLoading.value = true
  else loadingMore.value = true
  try {
    const result = await getConversationList({
      projectId: projectId.value,
      keyword: searchKeyword.value.trim() || undefined,
      page,
      pageSize: CONVERSATION_PAGE_SIZE,
    })
    if (requestId !== listRequestId) return
    conversations.value = reset ? result.list : [...conversations.value, ...result.list]
    listPage.value = result.pagination.page
    listHasMore.value = result.pagination.hasMore

    const searching = Boolean(searchKeyword.value.trim())
    if (conversations.value.length === 0 && !isPendingNewSession.value && !searching) {
      sessionContext.activeConversationId.value = null
      return
    }

    const activeExists = conversations.value.some((item) => item.id === activeConversationId.value)
    if (reset && !searching && !activeExists && !isPendingNewSession.value && conversations.value.length > 0) {
      sessionContext.selectConversation(conversations.value[0]!.id, false)
    }
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    if (requestId === listRequestId) {
      listLoading.value = false
      loadingMore.value = false
    }
  }
}

function handleSessionListScroll(event: Event) {
  const target = event.currentTarget as HTMLElement
  if (target.scrollHeight - target.scrollTop - target.clientHeight > 80) return
  void fetchConversationList(false)
}

/**
 * 将首条消息创建成功的会话加入列表
 * @param payload 创建结果
 */
function addCreatedConversation(payload: { id: number; title: string; firstMessage: string; createdAt: string }) {
  const newConversation: ConversationSummary = {
    id: payload.id,
    projectId: projectId.value,
    title: payload.title,
    preview: payload.firstMessage,
    messageCount: 2,
    createdAt: payload.createdAt,
    updatedAt: payload.createdAt,
  }
  if (conversations.value.some((item) => item.id === payload.id)) return
  const keyword = searchKeyword.value.trim().toLocaleLowerCase()
  if (keyword && !newConversation.title.toLocaleLowerCase().includes(keyword)) return
  conversations.value.unshift(newConversation)
}

/**
 * 新建会话：进入待创建状态，等用户发送首条消息后再调接口
 */
function handleCreateSession() {
  if (!projectId.value || isPendingNewSession.value) return
  sessionContext.startNewSession()
}

/**
 * 切换会话
 * @param conversationId 会话 ID
 */
function handleSelectSession(conversationId: number) {
  sessionContext.selectConversation(conversationId)
}

/**
 * 从本地列表移除会话并更新选中态
 * @param conversationId 会话 ID
 */
function removeSessionLocally(conversationId: number) {
  conversations.value = conversations.value.filter((item) => item.id !== conversationId)

  if (activeConversationId.value === conversationId) {
    const nextId = conversations.value[0]?.id ?? null
    if (nextId) {
      sessionContext.selectConversation(nextId)
    } else {
      sessionContext.isPendingNewSession.value = false
      sessionContext.activeConversationId.value = null
      sessionContext.chatResetSignal.value++
    }
  }
}

/**
 * 删除会话
 * @param conversation 会话摘要
 */
async function handleDeleteSession(conversation: ConversationSummary) {
  if (!projectId.value) return

  try {
    await ElMessageBox.confirm('确定要删除该会话吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    await deleteConversation(conversation.id)
    removeSessionLocally(conversation.id)
    ElMessage.success('会话删除成功')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    // 错误提示由 axios 拦截器统一处理
  }
}

/**
 * 修改会话标题
 * @param conversation 会话摘要
 */
async function handleRenameSession(conversation: ConversationSummary) {
  if (!projectId.value) return

  try {
    const { value } = await ElMessageBox.prompt('请输入会话标题', '修改标题', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: conversation.title,
      inputPlaceholder: '请输入会话标题',
      inputValidator: (val) => !!val.trim() || '标题不能为空',
    })

    const newTitle = value.trim()
    if (newTitle === conversation.title) return

    await updateConversation(conversation.id, newTitle)
    const target = conversations.value.find((item) => item.id === conversation.id)
    if (target) {
      target.title = newTitle
    }
    if (activeConversationId.value === conversation.id) {
      sessionContext.selectConversation(conversation.id)
    }

    ElMessage.success('标题修改成功')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    // 错误提示由 axios 拦截器统一处理
  }
}

/** 返回首页切换项目 */
function handleSwitchProject() {
  router.push('/')
}

watch(searchKeyword, () => {
  void fetchConversationList()
})

watch(
  () => sessionContext.lastCreatedConversation.value,
  (payload) => {
    if (!payload) return
    addCreatedConversation(payload)
    sessionContext.lastCreatedConversation.value = null
  },
)

watch(projectId, (id) => {
  if (id) void fetchConversationList()
}, { immediate: true })

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
})
</script>

<template>
  <aside class="session-panel">
    <header class="session-panel-header">
      <div class="session-panel-heading">
        <span>WORKSPACE / SESSIONS</span>
        <div class="session-panel-title">会话</div>
      </div>
      <button type="button" class="builder-session-toggle-btn" title="收起会话栏" aria-label="收起会话栏" @click.stop="sessionContext.toggleSessionPanelCollapsed()">
        <el-icon>
          <DArrowLeft />
        </el-icon>
      </button>
    </header>

    <section class="session-section">
      <button type="button" class="session-create-btn" :disabled="isPendingNewSession || !projectId" @click="handleCreateSession">
        <el-icon class="session-create-icon" aria-hidden="true">
          <Plus />
        </el-icon>
        <span style="white-space: nowrap">新建会话</span>
      </button>

      <el-input v-model="searchInput" class="session-search" placeholder="搜索会话" :prefix-icon="Search" clearable @input="handleSearchInput" />

      <div v-loading="listLoading" class="session-list" @scroll.passive="handleSessionListScroll">
        <div v-if="isPendingNewSession" class="session-item session-item--active" @click="handleCreateSession">
          <div class="session-item-row">
            <span class="session-item-title">新会话</span>
          </div>
          <div class="session-item-row session-item-row--bottom">
            <span class="session-item-preview">{{ SESSION_EMPTY_PREVIEW }}</span>
          </div>
        </div>

        <div
          v-for="conversation in conversations"
          :key="conversation.id"
          class="session-item"
          :class="{ 'session-item--active': conversation.id === activeConversationId }"
          @click="handleSelectSession(conversation.id)"
        >
          <div class="session-item-row">
            <span class="session-item-title">{{ getSessionTitle(conversation) }}</span>
            <span class="session-item-time">{{ formatSessionTime(conversation.updatedAt) }}</span>
          </div>
          <div class="session-item-row session-item-row--bottom">
            <span class="session-item-preview">{{ getSessionPreview(conversation) }}</span>
            <div class="session-item-actions" @click.stop>
              <button type="button" class="session-item-action" title="修改标题" @click.stop="handleRenameSession(conversation)">
                <el-icon>
                  <Edit />
                </el-icon>
              </button>
              <button type="button" class="session-item-action session-item-action--delete" title="删除会话" @click.stop="handleDeleteSession(conversation)">
                <el-icon>
                  <Delete />
                </el-icon>
              </button>
            </div>
          </div>
        </div>

        <div v-if="loadingMore" class="session-empty">正在加载更多...</div>
        <div v-if="!listLoading && !isPendingNewSession && conversations.length === 0" class="session-empty">暂无会话</div>
      </div>
    </section>

    <footer class="session-panel-footer">
      <div class="project-card">
        <div class="project-card-body">
          <div class="project-card-label">当前项目</div>
          <div class="project-card-name">{{ projectTitle }}</div>
          <div class="project-card-desc">{{ projectDesc }}</div>
        </div>
        <button type="button" class="project-card-switch" title="切换项目" @click="handleSwitchProject">
          <el-icon>
            <Sort />
          </el-icon>
        </button>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.session-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem 0.75rem;
  background-color: var(--app-bg-muted);
}

.session-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.25rem 1rem;
  flex-shrink: 0;
}

.session-panel-header-brand {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
  cursor: pointer;
}

.session-panel-header-brand .session-panel-title {
  cursor: pointer;
  white-space: nowrap;
}

.session-panel-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1.5px solid var(--app-accent);
  border-radius: 0.5rem;
  flex-shrink: 0;
}

.session-panel-logo-svg {
  display: block;
  width: 1.5rem;
  height: 1.5rem;
  background: #2463dc;
  mask: url('/svgs/ai-agent.svg') center / contain no-repeat;
}

.session-panel-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-accent);
  line-height: 1.3;
}

.session-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.session-create-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3125rem;
  width: 100%;
  height: 2rem;
  margin-bottom: 0.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background-color: var(--app-bg-subtle);
  color: var(--app-text-primary);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.session-create-icon {
  font-size: 0.8125rem;
}

.session-create-icon :deep(svg) {
  display: block;
}

.session-create-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.session-create-btn:not(:disabled):hover {
  background-color: var(--app-border-strong);
  border-color: var(--app-border-strong);
  color: var(--app-text-primary);
}

.session-search {
  margin-bottom: 0.75rem;
}

.session-search :deep(.el-input__wrapper) {
  border-radius: 0.5rem;
  border: 1px solid var(--app-border-strong);
  box-shadow: none;
}

.session-search :deep(.el-input__wrapper.is-focus) {
  border-color: #2463dc;
  box-shadow: 0 0 0 2px rgba(36, 99, 220, 0.15);
}

.session-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.session-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 4rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

.session-item {
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.session-item:hover {
  background-color: var(--app-surface-hover);
}

.session-item--active {
  background-color: var(--app-accent-soft);
  border-color: var(--app-border);
  border-left: 3px solid var(--app-accent);
  padding-left: calc(0.75rem - 2px);
}

.session-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.session-item-row--bottom {
  margin-top: 0.25rem;
}

.session-item-title {
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--app-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-item-time {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}

.session-item-preview {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  color: var(--app-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-item-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.session-item-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: 0.25rem;
  background: none;
  color: var(--app-text-muted);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.session-item-action:hover {
  background-color: rgba(0, 0, 0, 0.05);
  color: var(--app-accent);
}

.session-item-action--delete:hover {
  color: var(--app-danger);
}

.session-panel-footer {
  flex-shrink: 0;
  padding-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.project-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--app-card-border);
  border-radius: 0.35rem;
  background-color: var(--app-surface);
}

.project-card-body {
  flex: 1;
  min-width: 0;
}

.project-card-label {
  font-size: 0.75rem;
  color: var(--app-text-muted);
  margin-bottom: 0.125rem;
  white-space: nowrap;
}

.project-card-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--app-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card-desc {
  margin-top: 0.125rem;
  font-size: 0.75rem;
  color: var(--app-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-card-switch {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background-color: var(--app-bg-subtle);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease;
}

.project-card-switch:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

.user-bar {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.25rem;
}

.user-bar :deep(.user-menu-trigger--compact) {
  flex: 1;
  min-width: 0;
}
</style>
