<script setup lang="ts">
import { MoreFilled, Search, Sort } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { MOCK_NICKNAME, MOCK_SESSION_LIST, SESSION_EMPTY_PREVIEW, type SessionListItem } from './mockSessions'

defineOptions({
  name: 'SessionPanel',
})

const router = useRouter()
const projectStore = useProjectStore()

/** 静态用户昵称 */
const nickName = MOCK_NICKNAME

/** 静态会话列表 */
const sessions = ref<SessionListItem[]>([...MOCK_SESSION_LIST])

/** 当前选中的会话 id */
const activeSessionId = ref(MOCK_SESSION_LIST[0]?.id ?? '')

/** 会话搜索关键词 */
const searchKeyword = ref('')

/** 当前项目标题 */
const projectTitle = computed(() => projectStore.currentProject?.title ?? '项目名称')

/** 当前项目描述展示文案 */
const projectDesc = computed(() => {
  const desc = projectStore.currentProject?.desc?.trim() ?? ''
  return desc || '暂无描述'
})

/** 搜索过滤后的会话列表 */
const filteredSessions = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return sessions.value

  return sessions.value.filter((session) => {
    const title = getSessionTitle(session).toLowerCase()
    const preview = getSessionPreview(session).toLowerCase()
    return title.includes(keyword) || preview.includes(keyword)
  })
})

/**
 * 获取会话标题
 * @param session 会话项
 */
function getSessionTitle(session: SessionListItem) {
  return session.firstMessage.trim() || '新会话'
}

/**
 * 获取会话预览
 * @param session 会话项
 */
function getSessionPreview(session: SessionListItem) {
  return session.lastMessage.trim() || SESSION_EMPTY_PREVIEW
}

/**
 * 切换会话（静态：仅更新选中态）
 * @param sessionId 会话 ID
 */
function handleSelectSession(sessionId: string) {
  activeSessionId.value = sessionId
}

/** 返回首页切换项目 */
function handleSwitchProject() {
  router.push('/')
}
</script>

<template>
  <aside class="session-panel">
    <header class="session-panel-header" @click="handleSwitchProject">
      <div class="session-panel-logo">
        <svg class="session-panel-logo-svg" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M128 448a96 96 0 0 1 28.032 187.84v63.232l0.256 4.288a32 32 0 0 0 15.68 23.424l324.032 187.072 3.84 1.856a32.128 32.128 0 0 0 28.16-1.92l323.968-187.008 3.52-2.368a32 32 0 0 0 12.416-25.344v-11.072a32 32 0 0 1 64 0v11.072a96 96 0 0 1-37.376 76.096l-10.56 7.04-323.968 187.072a96.128 96.128 0 0 1-84.544 5.632l-11.456-5.632-324.032-187.072a96 96 0 0 1-47.104-70.4l-0.896-12.736V632.96A96 96 0 0 1 128 448z m338.56-96c22.08 0 41.792 14.144 48.96 35.2l84.352 248.448a27.52 27.52 0 1 1-52.288 17.216L526.72 587.136H404.608l-21.76 66.432a26.752 26.752 0 1 1-50.752-16.96l85.376-249.6A51.84 51.84 0 0 1 466.56 352z m209.92 0a27.52 27.52 0 0 1 27.52 27.584v264.896a27.584 27.584 0 0 1-55.104 0V379.52a27.52 27.52 0 0 1 27.52-27.52zM128 512a32 32 0 1 0 0 64 32 32 0 0 0 0-64zM475.456 49.152A96 96 0 0 1 560 54.784l323.968 187.072 10.56 7.04a96 96 0 0 1 37.44 76.096v65.92a96 96 0 1 1-64-2.752v-63.168a32 32 0 0 0-12.48-25.344l-3.584-2.368L528 110.208a32 32 0 0 0-28.16-1.92l-3.84 1.92-324.032 187.072a32 32 0 0 0-16 27.712v11.008a32 32 0 0 1-64 0v-11.008a96 96 0 0 1 48-83.2L464 54.848l11.456-5.632z m-54.4 487.296h89.28l-41.728-130.496h-5.056l-42.496 130.56zM896 448a32 32 0 1 0 0 64 32 32 0 0 0 0-64z"
            fill="#2463dc"
          />
        </svg>
      </div>
      <div class="session-panel-title">GameAgent</div>
    </header>

    <section class="session-section">
      <div class="session-section-header">
        <span class="session-section-label">会话</span>
        <button type="button" class="session-create-btn" disabled>+ 新建会话</button>
      </div>

      <el-input v-model="searchKeyword" class="session-search" placeholder="搜索会话" :prefix-icon="Search" clearable />

      <div class="session-list">
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          class="session-item"
          :class="{ 'session-item--active': session.id === activeSessionId }"
          @click="handleSelectSession(session.id)"
        >
          <div class="session-item-row">
            <span class="session-item-title">{{ getSessionTitle(session) }}</span>
            <span class="session-item-time">{{ session.time }}</span>
          </div>
          <div class="session-item-row session-item-row--bottom">
            <span class="session-item-preview">{{ getSessionPreview(session) }}</span>
            <button type="button" class="session-item-more" @click.stop>
              <el-icon><MoreFilled /></el-icon>
            </button>
          </div>
        </div>
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
          <el-icon><Sort /></el-icon>
        </button>
      </div>

      <div class="user-bar">
        <div class="user-bar-avatar">
          <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M746.666667 657.066667c-29.866667-29.866667-64-51.2-102.4-68.266667 29.866667-34.133333 51.2-76.8 51.2-128 0-102.4-81.066667-183.466667-183.466667-183.466667s-183.466667 81.066667-183.466667 183.466667c0 51.2 21.333333 93.866667 51.2 128-38.4 17.066667-72.533333 38.4-102.4 68.266667-17.066667 17.066667-17.066667 42.666667 0 59.733333 8.533333 8.533333 21.333333 12.8 29.866667 12.8 12.8 0 21.333333-4.266667 29.866667-12.8 46.933333-46.933333 106.666667-72.533333 174.933333-72.533333 64 0 128 25.6 174.933333 72.533333 17.066667 17.066667 42.666667 17.066667 59.733334 0 17.066667-17.066667 17.066667-42.666667 0-59.733333z m-332.8-196.266667c0-55.466667 42.666667-98.133333 98.133333-98.133333 55.466667 0 98.133333 42.666667 98.133333 98.133333 0 55.466667-42.666667 98.133333-98.133333 98.133333-55.466667 0-98.133333-42.666667-98.133333-98.133333z"
              fill="currentColor"
            />
            <path
              d="M512 85.333333C276.352 85.333333 85.333333 276.352 85.333333 512s191.018667 426.666667 426.666667 426.666667 426.666667-191.018667 426.666667-426.666667S747.648 85.333333 512 85.333333zM170.666667 512a341.333333 341.333333 0 1 1 682.666666 0 341.333333 341.333333 0 0 1-682.666666 0z"
              fill="currentColor"
            />
          </svg>
        </div>
        <span class="user-bar-name">{{ nickName }}</span>
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
  background-color: #fbfcff;
}

.session-panel-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.25rem 1rem;
  flex-shrink: 0;
  cursor: pointer;
}

.session-panel-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1.5px solid #2463dc;
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
  color: #2463dc;
  line-height: 1.3;
}

.session-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.session-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  padding: 0 0.25rem;
}

.session-section-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1a1c1e;
}

.session-create-btn {
  padding: 0.125rem 0.375rem;
  border: none;
  background: none;
  font-size: 0.8125rem;
  color: #2463dc;
  cursor: pointer;
}

.session-create-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.session-create-btn:not(:disabled):hover {
  text-decoration: underline;
}

.session-search {
  margin-bottom: 0.75rem;
}

.session-search :deep(.el-input__wrapper) {
  border-radius: 0.5rem;
  border: 1px solid #e0e0e6;
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
  background-color: #f3f6fc;
}

.session-item--active {
  background-color: #eef4ff;
  border-color: #d6e4ff;
  border-left: 3px solid #2463dc;
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
  color: #1a1c1e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-item-time {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: #9ca3af;
}

.session-item-preview {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  color: #73767a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-item-more {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: 0.25rem;
  background: none;
  color: #9ca3af;
  cursor: default;
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
  border: 1px solid #e8ebf0;
  border-radius: 0.35rem;
  background-color: #fff;
}

.project-card-body {
  flex: 1;
  min-width: 0;
}

.project-card-label {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-bottom: 0.125rem;
}

.project-card-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: #1a1c1e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-card-desc {
  margin-top: 0.125rem;
  font-size: 0.75rem;
  color: #73767a;
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
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  background-color: #f9fafb;
  color: #606266;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease;
}

.project-card-switch:hover {
  border-color: #2463dc;
  color: #2463dc;
}

.user-bar {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.25rem;
}

.user-bar-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background-color: #eef4ff;
  color: #2463dc;
  flex-shrink: 0;
}

.user-bar-avatar svg {
  width: 1.25rem;
  height: 1.25rem;
}

.user-bar-name {
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  color: #1a1c1e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-bar-arrow {
  width: 1rem;
  height: 1rem;
  color: #9ca3af;
  flex-shrink: 0;
}
</style>
