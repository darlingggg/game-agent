<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProjectList } from '@/http/project'
import { useProjectStore } from '@/stores/project'
import {
  ChatPanel,
  ConfigPanel,
  FilePanel,
  LogPanel,
  PreviewPanel,
  SessionPanel,
  SnapshotPanel,
} from './panels'
import { createBuildContext, buildContextKey } from './build/buildContext'
import { createLogContext, logContextKey } from './log/logContext'
import { PENDING_SESSION_ID, sessionContextKey, type CreatedSessionPayload } from './session/sessionContext'

defineOptions({
  name: 'BuilderIndex',
})

interface TabItem {
  key: string
  label: string
}

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

/** 当前激活会话 id */
const activeSessionId = ref<number | null>(null)

/** 是否处于待创建新会话状态 */
const isPendingNewSession = ref(false)

/** 聊天区重置信号 */
const chatResetSignal = ref(0)

/** 首条消息创建会话完成通知 */
const lastCreatedSession = ref<CreatedSessionPayload | null>(null)

/**
 * 开始新建会话，等待用户发送首条消息后再调用接口
 */
function startNewSession() {
  if (isPendingNewSession.value) return
  isPendingNewSession.value = true
  activeSessionId.value = PENDING_SESSION_ID
  chatResetSignal.value++
}

/**
 * 切换会话
 * @param sessionId 会话 id
 * @param resetChat 是否重置聊天区
 */
function selectSession(sessionId: number, resetChat = true) {
  isPendingNewSession.value = false
  activeSessionId.value = sessionId
  if (resetChat) {
    chatResetSignal.value++
  }
}

provide(sessionContextKey, {
  activeSessionId,
  isPendingNewSession,
  chatResetSignal,
  lastCreatedSession,
  startNewSession,
  selectSession,
})

/** 日志上下文，供聊天面板写入、日志面板展示 */
const logContext = createLogContext()
provide(logContextKey, logContext)

/** 构建日志上下文，供预览面板触发、日志面板悬浮框展示 */
const buildContext = createBuildContext()
provide(buildContextKey, buildContext)

/** 构建开始时自动切换到日志 Tab，确保悬浮框可见 */
watch(
  () => buildContext.running.value,
  (running) => {
    if (!running) return
    const logIndex = tabs.findIndex((item) => item.key === 'log')
    if (logIndex < 0) return
    switchToLogTab(logIndex)
  },
)

const tabs: TabItem[] = [
  { key: 'chat', label: '对话' },
  { key: 'file', label: '文件' },
  { key: 'config', label: '配置' },
  { key: 'snapshot', label: '版本' },
  { key: 'log', label: '日志' },
]

/** 当前选中的 Tab 索引 */
const activeTab = ref(0)

/** Tab 滑动方向 */
type PanelSlideDirection = 'forward' | 'backward'

/** 面板切换动画时长（毫秒） */
const PANEL_TRANSITION_MS = 280

/** 正在退出的 Tab key */
const leavingTabKey = ref<string | null>(null)

/** 当前滑动方向 */
const slideDirection = ref<PanelSlideDirection>('forward')

/** 是否正在切换动画中 */
const isPanelTransitioning = ref(false)

/** 面板切换动画结束定时器 */
let panelTransitionTimer: ReturnType<typeof setTimeout> | null = null

/** 已挂载过的 Tab 面板（首次访问后保持挂载，避免切换丢失状态） */
const mountedTabKeys = ref<Set<string>>(new Set(['chat']))

/** Tab 元素引用，用于计算底部指示条位置 */
const tabRefs = ref<HTMLElement[]>([])

/** 底部指示条样式 */
const indicatorStyle = ref({
  width: '0px',
  transform: 'translateX(0px)',
})

/** 项目初始化中 */
const projectLoading = ref(true)

/** 项目初始化错误 */
const projectError = ref('')

/** 当前项目是否就绪 */
const projectReady = computed(() => !projectLoading.value && !projectError.value && !!projectStore.currentProject)

/**
 * 收集 Tab 元素引用
 * @param el Tab DOM 元素
 * @param index Tab 索引
 */
function setTabRef(el: Element | ComponentPublicInstance | null, index: number) {
  if (el instanceof HTMLElement) {
    tabRefs.value[index] = el
  }
}

/** 更新底部指示条位置与宽度 */
function updateIndicator() {
  const el = tabRefs.value[activeTab.value]
  if (!el) return

  indicatorStyle.value = {
    width: `${el.offsetWidth}px`,
    transform: `translateX(${el.offsetLeft}px)`,
  }
}

/**
 * 构建开始时强制切到日志 Tab（不受切换动画阻塞）
 * @param index 日志 Tab 索引
 */
function switchToLogTab(index: number) {
  if (index === activeTab.value) return

  slideDirection.value = index > activeTab.value ? 'forward' : 'backward'
  leavingTabKey.value = tabs[activeTab.value]?.key ?? null
  mountedTabKeys.value = new Set([...mountedTabKeys.value, 'log'])
  activeTab.value = index
  isPanelTransitioning.value = true

  if (panelTransitionTimer) {
    clearTimeout(panelTransitionTimer)
  }
  panelTransitionTimer = setTimeout(() => {
    leavingTabKey.value = null
    isPanelTransitioning.value = false
    panelTransitionTimer = null
  }, PANEL_TRANSITION_MS)

  nextTick(updateIndicator)
}

/**
 * 切换 Tab
 * @param index 目标 Tab 索引
 */
function switchTab(index: number) {
  if (index === activeTab.value || isPanelTransitioning.value) return

  slideDirection.value = index > activeTab.value ? 'forward' : 'backward'
  leavingTabKey.value = tabs[activeTab.value]?.key ?? null

  const newKey = tabs[index]?.key
  if (newKey) {
    mountedTabKeys.value = new Set([...mountedTabKeys.value, newKey])
  }

  activeTab.value = index
  isPanelTransitioning.value = true

  if (panelTransitionTimer) {
    clearTimeout(panelTransitionTimer)
  }
  panelTransitionTimer = setTimeout(() => {
    leavingTabKey.value = null
    isPanelTransitioning.value = false
    panelTransitionTimer = null
  }, PANEL_TRANSITION_MS)

  nextTick(updateIndicator)
}

/** 当前选中 Tab 的内容标识 */
const activeTabKey = computed(() => tabs[activeTab.value]?.key ?? 'chat')

/**
 * 获取面板切换动效 class（v-show 保持挂载，仅用 class 控制显隐与动画）
 * @param key Tab key
 */
function getPanelTransitionClass(key: string) {
  const isActive = activeTabKey.value === key
  const isLeaving = leavingTabKey.value === key

  if (!isPanelTransitioning.value) {
    return isActive ? ['main-content-panel--active'] : ['main-content-panel--idle']
  }

  if (isActive) {
    return [`main-content-panel--enter-${slideDirection.value}`]
  }
  if (isLeaving) {
    return [`main-content-panel--leave-${slideDirection.value}`]
  }
  return ['main-content-panel--idle']
}

/**
 * 是否应挂载 Tab 面板（未访问过的 Tab 不加载 chunk，减少首屏体积）
 * @param key Tab key
 */
function shouldMountTabPanel(key: string) {
  return mountedTabKeys.value.has(key)
}

/**
 * 从地址栏 projectId 初始化当前项目
 */
async function initCurrentProject() {
  const projectId = Number(route.query.projectId)
  if (!projectId || Number.isNaN(projectId)) {
    ElMessage.warning('缺少项目 ID')
    await router.replace('/')
    return
  }

  projectLoading.value = true
  projectError.value = ''

  try {
    let project = projectStore.getProjectById(projectId)

    if (!project) {
      const list = await getProjectList()
      projectStore.setProjectList(list)
      project = projectStore.getProjectById(projectId)
    }

    if (!project) {
      ElMessage.warning('项目不存在')
      await router.replace('/')
      return
    }

    projectStore.setCurrentProject(project)
  } catch (error) {
    projectError.value = error instanceof Error ? error.message : '项目信息加载失败'
  } finally {
    projectLoading.value = false
  }
}

onMounted(() => {
  nextTick(updateIndicator)
  window.addEventListener('resize', updateIndicator)
})

/** 地址栏 projectId 变化时重新加载项目 */
watch(
  () => route.query.projectId,
  () => {
    void initCurrentProject()
  },
  { immediate: true },
)

onUnmounted(() => {
  window.removeEventListener('resize', updateIndicator)
  if (panelTransitionTimer) {
    clearTimeout(panelTransitionTimer)
  }
  projectStore.setCurrentProject(null)
})
</script>

<template>
  <div v-if="projectLoading" class="builder-status">正在加载项目...</div>
  <div v-else-if="projectError" class="builder-status builder-status--error">{{ projectError }}</div>
  <div v-else-if="projectReady" class="container">
    <section class="left">
      <SessionPanel />
    </section>
    <main class="main">
      <div class="main-tab">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.key"
          :ref="(el) => setTabRef(el, index)"
          class="main-tab-item"
          :class="{ 'main-tab-item--active': activeTab === index }"
          @click="switchTab(index)"
        >
          {{ tab.label }}
        </div>
        <div class="main-tab-indicator" :style="indicatorStyle" />
      </div>
      <div class="main-content">
        <div class="main-content-viewport">
          <!-- 首次访问才挂载对应面板 chunk，访问后保持挂载避免丢失状态 -->
          <ChatPanel
            v-if="shouldMountTabPanel('chat')"
            class="main-content-panel"
            :class="getPanelTransitionClass('chat')"
            :aria-hidden="activeTabKey !== 'chat' && leavingTabKey !== 'chat'"
          />
          <FilePanel
            v-if="shouldMountTabPanel('file')"
            class="main-content-panel"
            :class="getPanelTransitionClass('file')"
            :aria-hidden="activeTabKey !== 'file' && leavingTabKey !== 'file'"
          />
          <ConfigPanel
            v-if="shouldMountTabPanel('config')"
            class="main-content-panel"
            :class="getPanelTransitionClass('config')"
            :aria-hidden="activeTabKey !== 'config' && leavingTabKey !== 'config'"
          />
          <SnapshotPanel
            v-if="shouldMountTabPanel('snapshot')"
            class="main-content-panel"
            :class="getPanelTransitionClass('snapshot')"
            :aria-hidden="activeTabKey !== 'snapshot' && leavingTabKey !== 'snapshot'"
          />
          <LogPanel
            v-if="shouldMountTabPanel('log')"
            class="main-content-panel"
            :class="getPanelTransitionClass('log')"
            :aria-hidden="activeTabKey !== 'log' && leavingTabKey !== 'log'"
          />
        </div>
      </div>
    </main>
    <section class="right">
      <PreviewPanel />
    </section>
  </div>
</template>

<style scoped>
.builder-status {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  color: var(--app-text-secondary);
  background-color: var(--app-bg);
}

.builder-status--error {
  color: var(--app-error);
}

:global(.builder-panel-loading) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 0.875rem;
  color: var(--app-text-muted);
}

.container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  display: flex;
  background-color: var(--app-bg);
}

.left {
  flex: 1;
  height: 100%;
  min-width: 0;
  border-right: 1px solid var(--app-border);
}

.main {
  flex: 3;
  height: 100%;
  background-color: var(--app-surface);
  display: flex;
  flex-direction: column;
}

.main-tab {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: start;
  gap: 1rem;
  align-items: center;
  padding: 0 1rem;
  border-bottom: 1px solid var(--app-border);
}

.main-tab-item {
  font-size: 1rem;
  padding: 0.5rem 2rem;
  color: var(--app-text-primary);
  font-weight: 700;
  cursor: pointer;
  transition: color 0.2s ease;
}

.main-tab-item--active {
  color: var(--app-accent);
}

.main-tab-indicator {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background-color: var(--app-accent);
  transition:
    transform 0.25s ease,
    width 0.25s ease;
}

.main-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.main-content-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.main-content-panel {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  opacity: 0;
  pointer-events: none;
  z-index: 0;
  visibility: hidden;
}

.main-content-panel--active {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
  z-index: 2;
  visibility: visible;
}

.main-content-panel--idle {
  opacity: 0;
  transform: translateX(0);
  pointer-events: none;
  z-index: 0;
  visibility: hidden;
}

.main-content-panel--enter-forward {
  animation: panel-enter-forward 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: auto;
  z-index: 2;
  visibility: visible;
}

.main-content-panel--enter-backward {
  animation: panel-enter-backward 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: auto;
  z-index: 2;
  visibility: visible;
}

.main-content-panel--leave-forward {
  animation: panel-leave-forward 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none;
  z-index: 1;
  visibility: visible;
}

.main-content-panel--leave-backward {
  animation: panel-leave-backward 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none;
  z-index: 1;
  visibility: visible;
}

@keyframes panel-enter-forward {
  from {
    transform: translateX(5rem);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes panel-leave-forward {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(-5rem);
    opacity: 0;
  }
}

@keyframes panel-enter-backward {
  from {
    transform: translateX(-5rem);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes panel-leave-backward {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(5rem);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .main-content-panel--enter-forward,
  .main-content-panel--enter-backward,
  .main-content-panel--leave-forward,
  .main-content-panel--leave-backward {
    animation: none;
  }

  .main-content-panel--enter-forward,
  .main-content-panel--enter-backward,
  .main-content-panel--active {
    opacity: 1;
    transform: translateX(0);
    visibility: visible;
  }

  .main-content-panel--leave-forward,
  .main-content-panel--leave-backward,
  .main-content-panel--idle {
    opacity: 0;
    visibility: hidden;
  }
}

.right {
  flex: 1.5;
  height: 100%;
  min-width: 0;
  border-left: 1px solid var(--app-border);
}
</style>
