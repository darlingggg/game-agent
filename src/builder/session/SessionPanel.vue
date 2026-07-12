<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatLineRound, DArrowLeft, Delete, Edit, Search, Sort } from '@element-plus/icons-vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { deleteSession, getSessionList, updateSession, type sessionItem } from '@/http/session'
import { getUserInfo } from '@/http/user'
import { useProjectStore } from '@/stores/project'
import ThemeToggle from '@/components/ThemeToggle.vue'
import UserMenu from '@/components/UserMenu.vue'
import { SESSION_EMPTY_PREVIEW } from './constants'
import { useSessionContext } from './sessionContext'

defineOptions({
  name: 'SessionPanel',
})

const router = useRouter()
const projectStore = useProjectStore()
const sessionContext = useSessionContext()

/** 用户昵称 */
const nickName = ref('')

/** 会话列表 */
const sessions = ref<sessionItem[]>([])

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

/** 当前项目 ID */
const projectId = computed(() => projectStore.currentProject?.id ?? 0)

/** 当前激活会话 id */
const activeSessionId = computed(() => sessionContext.activeSessionId.value)

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
 * @param session 会话项
 */
function getSessionTitle(session: sessionItem) {
  return session.title.trim() || session.content?.trim() || '新会话'
}

/**
 * 获取会话预览
 * @param session 会话项
 */
function getSessionPreview(session: sessionItem) {
  return session.content?.trim() || SESSION_EMPTY_PREVIEW
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

/**
 * 获取 filterMap 去重键
 * @param session 会话项
 */
function getFilterMapKey(session: sessionItem) {
  return session.title.trim() || session.content?.trim() || String(session.id)
}

/**
 * 加载会话列表
 */
const filterMap = new Map<string, number>()
async function fetchSessionList() {
  if (!projectId.value) return
  listLoading.value = true
  try {
    const title = searchKeyword.value.trim()
    const list = await getSessionList({
      projectId: projectId.value,
      title: title || undefined,
    })
    filterMap.clear()
    sessions.value = []
    for (const item of list) {
      const mapKey = getFilterMapKey(item)
      if (filterMap.has(mapKey)) continue
      filterMap.set(mapKey, item.id)
      sessions.value.push(item)
    }

    if (list.length === 0 && !isPendingNewSession.value) {
      sessionContext.activeSessionId.value = null
      return
    }

    const activeExists = list.some((item) => item.id === activeSessionId.value)
    if (!activeExists && !isPendingNewSession.value && list.length > 0) {
      sessionContext.selectSession(list[0]!.id, false)
    }
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    listLoading.value = false
  }
}

/**
 * 将首条消息创建成功的会话加入列表
 * @param payload 创建结果
 */
function addCreatedSession(payload: { id: number; content: string; firstMessage: string }) {
  const newSession: sessionItem = {
    id: payload.id,
    projectId: projectId.value,
    title: payload.firstMessage.slice(0, 30),
    account: nickName.value,
    role: 'user',
    content: payload.firstMessage,
    createdAt: new Date().toISOString(),
  }

  const mapKey = getFilterMapKey(newSession)
  if (!filterMap.has(mapKey)) {
    filterMap.set(mapKey, payload.id)
    sessions.value.unshift(newSession)
  }
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
 * @param sessionId 会话 ID
 */
function handleSelectSession(sessionId: number) {
  sessionContext.selectSession(sessionId)
}

/**
 * 从 filterMap 中移除指定标题
 * @param title 会话标题
 */
function removeFromFilterMap(title: string) {
  filterMap.delete(title.trim())
}

/**
 * 从本地列表移除会话并更新选中态
 * @param sessionId 会话 ID
 */
function removeSessionLocally(sessionId: number) {
  sessions.value = sessions.value.filter((item) => item.id !== sessionId)

  if (activeSessionId.value === sessionId) {
    const nextId = sessions.value[0]?.id ?? null
    if (nextId) {
      sessionContext.selectSession(nextId)
    } else {
      sessionContext.isPendingNewSession.value = false
      sessionContext.activeSessionId.value = null
      sessionContext.chatResetSignal.value++
    }
  }
}

/**
 * 删除会话
 * @param session 会话项
 */
async function handleDeleteSession(session: sessionItem) {
  if (!projectId.value) return

  try {
    await ElMessageBox.confirm('确定要删除该会话吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    await deleteSession({
      projectId: projectId.value,
      title: session.title,
    })

    removeFromFilterMap(session.title)
    removeSessionLocally(session.id)
    ElMessage.success('会话删除成功')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    // 错误提示由 axios 拦截器统一处理
  }
}

/**
 * 修改会话标题
 * @param session 会话项
 */
async function handleRenameSession(session: sessionItem) {
  if (!projectId.value) return

  try {
    const { value } = await ElMessageBox.prompt('请输入会话标题', '修改标题', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: session.title,
      inputPlaceholder: '请输入会话标题',
      inputValidator: (val) => !!val.trim() || '标题不能为空',
    })

    const newTitle = value.trim()
    if (newTitle === session.title) return

    await updateSession({
      oldTitle: session.title,
      title: newTitle,
      projectId: String(projectId.value),
    })

    removeFromFilterMap(session.title)
    filterMap.set(newTitle, session.id)

    const target = sessions.value.find((item) => item.id === session.id)
    if (target) {
      target.title = newTitle
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
  void fetchSessionList()
})

watch(
  () => sessionContext.lastCreatedSession.value,
  (payload) => {
    if (!payload) return
    addCreatedSession(payload)
    sessionContext.lastCreatedSession.value = null
  },
)

watch(projectId, (id) => {
  if (id) {
    void fetchSessionList()
  }
})

onMounted(async () => {
  try {
    const res = await getUserInfo()
    nickName.value = res.nickname
  } catch {
    // 错误提示由 axios 拦截器统一处理
  }

  if (projectId.value) {
    await fetchSessionList()
  }
})

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
  filterMap.clear()
})
</script>

<template>
  <aside class="session-panel">
    <header class="session-panel-header">
      <div class="session-panel-header-brand" @click="handleSwitchProject">
        <div class="session-panel-logo">
          <svg class="session-panel-logo-svg" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true">
            <path
              d="M128 448a96 96 0 0 1 28.032 187.84v63.232l0.256 4.288a32 32 0 0 0 15.68 23.424l324.032 187.072 3.84 1.856a32.128 32.128 0 0 0 28.16-1.92l323.968-187.008 3.52-2.368a32 32 0 0 0 12.416-25.344v-11.072a32 32 0 0 1 64 0v11.072a96 96 0 0 1-37.376 76.096l-10.56 7.04-323.968 187.072a96.128 96.128 0 0 1-84.544 5.632l-11.456-5.632-324.032-187.072a96 96 0 0 1-47.104-70.4l-0.896-12.736V632.96A96 96 0 0 1 128 448z m338.56-96c22.08 0 41.792 14.144 48.96 35.2l84.352 248.448a27.52 27.52 0 1 1-52.288 17.216L526.72 587.136H404.608l-21.76 66.432a26.752 26.752 0 1 1-50.752-16.96l85.376-249.6A51.84 51.84 0 0 1 466.56 352z m209.92 0a27.52 27.52 0 0 1 27.52 27.584v264.896a27.584 27.584 0 0 1-55.104 0V379.52a27.52 27.52 0 0 1 27.52-27.52zM128 512a32 32 0 1 0 0 64 32 32 0 0 0 0-64zM475.456 49.152A96 96 0 0 1 560 54.784l323.968 187.072 10.56 7.04a96 96 0 0 1 37.44 76.096v65.92a96 96 0 1 1-64-2.752v-63.168a32 32 0 0 0-12.48-25.344l-3.584-2.368L528 110.208a32 32 0 0 0-28.16-1.92l-3.84 1.92-324.032 187.072a32 32 0 0 0-16 27.712v11.008a32 32 0 0 1-64 0v-11.008a96 96 0 0 1 48-83.2L464 54.848l11.456-5.632z m-54.4 487.296h89.28l-41.728-130.496h-5.056l-42.496 130.56zM896 448a32 32 0 1 0 0 64 32 32 0 0 0 0-64z"
              fill="#2463dc" />
          </svg>
        </div>
        <div class="session-panel-title">AI Agent</div>
      </div>
      <button type="button" class="builder-session-toggle-btn" title="收起会话栏" aria-label="收起会话栏"
        @click.stop="sessionContext.toggleSessionPanelCollapsed()">
        <el-icon>
          <DArrowLeft />
        </el-icon>
      </button>
    </header>

    <section class="session-section">
      <button type="button" class="session-create-btn" :disabled="isPendingNewSession || !projectId"
        @click="handleCreateSession">
        <el-icon class="session-create-icon" aria-hidden="true">
          <ChatLineRound />
        </el-icon>
        <span style="white-space: nowrap;">新建会话</span>
      </button>

      <el-input v-model="searchInput" class="session-search" placeholder="搜索会话" :prefix-icon="Search" clearable
        @input="handleSearchInput" />

      <div v-loading="listLoading" class="session-list">
        <div v-if="isPendingNewSession" class="session-item session-item--active" @click="handleCreateSession">
          <div class="session-item-row">
            <span class="session-item-title">新会话</span>
          </div>
          <div class="session-item-row session-item-row--bottom">
            <span class="session-item-preview">{{ SESSION_EMPTY_PREVIEW }}</span>
          </div>
        </div>

        <div v-for="session in sessions" :key="session.id" class="session-item"
          :class="{ 'session-item--active': session.id === activeSessionId }" @click="handleSelectSession(session.id)">
          <div class="session-item-row">
            <span class="session-item-title">{{ getSessionTitle(session) }}</span>
            <span class="session-item-time">{{ formatSessionTime(session.createdAt) }}</span>
          </div>
          <div class="session-item-row session-item-row--bottom">
            <span class="session-item-preview">{{ getSessionPreview(session) }}</span>
            <div class="session-item-actions" @click.stop>
              <button type="button" class="session-item-action" title="修改标题" @click.stop="handleRenameSession(session)">
                <el-icon>
                  <Edit />
                </el-icon>
              </button>
              <button type="button" class="session-item-action session-item-action--delete" title="删除会话"
                @click.stop="handleDeleteSession(session)">
                <el-icon>
                  <Delete />
                </el-icon>
              </button>
            </div>
          </div>
        </div>

        <div v-if="!listLoading && !isPendingNewSession && sessions.length === 0" class="session-empty">暂无会话</div>
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

      <div class="user-bar">
        <UserMenu :nickname="nickName" compact />
        <ThemeToggle />
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
  width: 1.5rem;
  height: 1.5rem;
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
