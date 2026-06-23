<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getProjectList } from '@/http/project'
import { useProjectStore } from '@/stores/project'
import ChatPanel from './chat/ChatPanel.vue'
import ConfigPanel from './config/ConfigPanel.vue'
import FilePanel from './file/FilePanel.vue'
import LogPanel from './log/LogPanel.vue'
import PreviewPanel from './preview/PreviewPanel.vue'
import SessionPanel from './session/SessionPanel.vue'
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

const tabs: TabItem[] = [
  { key: 'chat', label: '对话' },
  { key: 'file', label: '文件' },
  { key: 'config', label: '配置' },
  { key: 'log', label: '日志' },
]

/** Tab 对应的面板组件 */
const panelComponents = {
  chat: ChatPanel,
  file: FilePanel,
  config: ConfigPanel,
  log: LogPanel,
} as const

/** 当前选中的 Tab 索引 */
const activeTab = ref(0)

/** Panel 切换过渡名称（根据 Tab 索引方向决定左/右滑动） */
const panelTransitionName = ref('panel-slide-forward')

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
 * 切换 Tab
 * @param index 目标 Tab 索引
 */
function switchTab(index: number) {
  if (index === activeTab.value) return

  panelTransitionName.value = index > activeTab.value ? 'panel-slide-forward' : 'panel-slide-backward'
  activeTab.value = index
  nextTick(updateIndicator)
}

/** 当前选中 Tab 的内容标识 */
const activeTabKey = computed(() => tabs[activeTab.value]?.key ?? 'chat')

/** 当前选中的面板组件 */
const activePanelComponent = computed(() => panelComponents[activeTabKey.value as keyof typeof panelComponents])

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
        <div v-for="(tab, index) in tabs" :key="tab.key" :ref="(el) => setTabRef(el, index)" class="main-tab-item"
          :class="{ 'main-tab-item--active': activeTab === index }" @click="switchTab(index)">
          {{ tab.label }}
        </div>
        <div class="main-tab-indicator" :style="indicatorStyle" />
      </div>
      <div class="main-content">
        <div class="main-content-viewport">
          <KeepAlive include="ChatPanel">
            <Transition :name="panelTransitionName">
              <component :is="activePanelComponent" :key="activeTabKey" class="main-content-panel" />
            </Transition>
          </KeepAlive>
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
  width: 100%;
  height: 100%;
  min-height: 0;
}

/* 向右切换：新旧 panel 同时滑动，新 panel 从右侧滑入 */
.panel-slide-forward-enter-active,
.panel-slide-forward-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transition:
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.28s ease;
}

.panel-slide-forward-enter-active {
  z-index: 2;
}

.panel-slide-forward-leave-active {
  z-index: 1;
}

.panel-slide-forward-enter-from {
  transform: translateX(1.5rem);
  opacity: 0;
}

.panel-slide-forward-leave-to {
  transform: translateX(-1.5rem);
  opacity: 0.3;
}

/* 向左切换：新旧 panel 同时滑动，新 panel 从左侧滑入 */
.panel-slide-backward-enter-active,
.panel-slide-backward-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transition:
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.28s ease;
}

.panel-slide-backward-enter-active {
  z-index: 2;
}

.panel-slide-backward-leave-active {
  z-index: 1;
}

.panel-slide-backward-enter-from {
  transform: translateX(-1.5rem);
  opacity: 0.3;
}

.panel-slide-backward-leave-to {
  transform: translateX(1.5rem);
  opacity: 0.3;
}

@media (prefers-reduced-motion: reduce) {

  .panel-slide-forward-enter-active,
  .panel-slide-forward-leave-active,
  .panel-slide-backward-enter-active,
  .panel-slide-backward-leave-active {
    transition: none;
  }
}

.right {
  flex: 1.5;
  height: 100%;
  min-width: 0;
  border-left: 1px solid var(--app-border);
}
</style>
