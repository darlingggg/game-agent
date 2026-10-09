<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ArrowLeft, Camera, ChatDotRound, Check, CopyDocument, Document, Iphone, Monitor, Notebook, Picture, Search, Setting } from '@element-plus/icons-vue'
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch, type Component } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'
import UserMenu from '@/components/UserMenu.vue'
import { getProjectList, type projectItem } from '@/http/project'
import { getTempCurrentVersion, getTempLatestVersion } from '@/http/temp'
import type { UpdateUserProfileResponse } from '@/http/user'
import { useProjectStore } from '@/stores/project'
import { PROJECT_TYPE_LABEL, resolveProjectType } from '@/utils/projectType'
import { projectCardHue, takeProjectPrompt } from '@/utils/projectDraft'
import SvgIcon from '@/components/SvgIcon.vue'
import { compareTemplateVersions } from '@/utils/templateVersion'
import { ChatPanel, ConfigPanel, FilePanel, ImagePanel, LogPanel, PreviewPanel, SessionPanel, SnapshotPanel, TempPanel } from './panels'
import { createBuildContext, buildContextKey } from './build/buildContext'
import { createLogContext, logContextKey } from './log/logContext'
import { PENDING_CONVERSATION_ID, sessionContextKey, type CreatedConversationPayload } from './session/sessionContext'
import { useWorkspaceSplit } from './useWorkspaceSplit'

defineOptions({
  name: 'BuilderIndex',
})

interface TabItem {
  key: string
  label: string
  /** Tab 图标 */
  icon: Component
}

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const latestUserProfile = ref<UpdateUserProfileResponse | null>(null)
const sessionToggleRef = ref<HTMLButtonElement | null>(null)
const builderShellRef = ref<HTMLElement | null>(null)
const split = useWorkspaceSplit(builderShellRef)
const { leftWidth, resizing, percent: splitPercent, minPercent: splitMinPercent, maxPercent: splitMaxPercent } = split
let leavingBuilder = false
const initialPrompt = ref('')
const projectSwitchVisible = ref(false)
const projectSwitchLoading = ref(false)
const projectSwitchSearch = ref('')
const selectableProjects = computed(() => {
  const keyword = projectSwitchSearch.value.trim().toLowerCase()
  return projectStore.projectList.filter((project) => !keyword || project.title.toLowerCase().includes(keyword))
})

async function openProjectSwitcher() {
  projectSwitchSearch.value = ''
  projectSwitchVisible.value = true
  projectSwitchLoading.value = true
  try {
    projectStore.setProjectList(await getProjectList())
  } catch {
    // 请求层统一提示错误，已有的项目列表仍可浏览。
  } finally {
    projectSwitchLoading.value = false
  }
}

async function selectProject(project: projectItem) {
  projectSwitchVisible.value = false
  if (project.id === projectStore.currentProject?.id) return
  sessionPanelCollapsed.value = true
  await router.push({ path: '/builder', query: { projectId: String(project.id) } })
}

type MobilePane = 'workspace' | 'chat'

/** 当前是否进入会话抽屉布局 */
const isNarrowLayout = ref(false)

/** 当前是否进入手机单面板布局 */
const isMobileLayout = ref(false)

/** 手机端用两个视图保持对话和完整工作区可访问。 */
const mobilePane = ref<MobilePane>('chat')
const previewDevice = ref<'desktop' | 'mobile'>('desktop')
const logVisible = ref(false)
const logMounted = ref(false)
type SettingsPanel = 'config' | 'snapshot' | 'temp'
const settingsPanel = ref<SettingsPanel>('config')
const settingsDialogVisible = ref(false)
const settingsMounted = ref<Set<string>>(new Set())
const settingsTitles: Record<SettingsPanel, string> = { config: '项目设置', snapshot: '版本记录', temp: '项目模板' }
const currentTemplateVersion = ref('')
const latestTemplateVersion = ref('')
let templateCheckId = 0
const hasTemplateUpdate = computed(() =>
  Boolean(currentTemplateVersion.value && latestTemplateVersion.value && compareTemplateVersions(latestTemplateVersion.value, currentTemplateVersion.value) > 0),
)

async function refreshTemplateStatus() {
  const project = projectStore.currentProject
  const requestId = ++templateCheckId
  if (!project) return
  try {
    const [current, latest] = await Promise.all([getTempCurrentVersion({ projectId: project.id }), getTempLatestVersion({ type: resolveProjectType(project.type) })])
    if (requestId !== templateCheckId || projectStore.currentProject?.id !== project.id) return
    currentTemplateVersion.value = typeof current.version === 'string' ? current.version : ''
    latestTemplateVersion.value = typeof latest.version === 'string' ? latest.version : ''
  } catch {
    // 请求层统一提示错误，状态检查不阻断编辑器。
  }
}

function openSettings(command: unknown) {
  if (command !== 'config' && command !== 'snapshot' && command !== 'temp') return
  settingsPanel.value = command
  settingsMounted.value = new Set([...settingsMounted.value, command])
  settingsDialogVisible.value = true
}

function toggleLog() {
  logVisible.value = !logVisible.value
  if (logVisible.value) logMounted.value = true
}

let narrowMediaQuery: MediaQueryList | null = null
let mobileMediaQuery: MediaQueryList | null = null

function handleUserProfileUpdated(profile: UpdateUserProfileResponse) {
  latestUserProfile.value = profile
}

/** Builder 顶栏项目类型 */
const projectTypeLabel = computed(() => PROJECT_TYPE_LABEL[resolveProjectType(projectStore.currentProject?.type)])

/** 返回项目列表 */
function handleBackHome() {
  void router.push('/')
}

/** 当前激活会话 id */
const activeConversationId = ref<number | null>(null)

/** 是否处于待创建新会话状态 */
const isPendingNewSession = ref(false)

/** 聊天区重置信号 */
const chatResetSignal = ref(0)

/** 首条消息创建会话完成通知 */
const lastCreatedConversation = ref<CreatedConversationPayload | null>(null)

/** 会话栏是否收起 */
const sessionPanelCollapsed = ref(true)

/**
 * 切换会话栏收起/展开
 */
function toggleSessionPanelCollapsed() {
  const willCollapse = !sessionPanelCollapsed.value
  sessionPanelCollapsed.value = willCollapse

  if (willCollapse) {
    void nextTick(() => sessionToggleRef.value?.focus())
  }
}

/** 同步桌面、抽屉与手机断点状态 */
function syncResponsiveLayout() {
  const nextNarrow = narrowMediaQuery?.matches ?? false
  isNarrowLayout.value = nextNarrow
  isMobileLayout.value = mobileMediaQuery?.matches ?? false
  sessionPanelCollapsed.value = true
}

/** Escape 关闭窄屏会话抽屉 */
function handleShellKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || sessionPanelCollapsed.value) return
  toggleSessionPanelCollapsed()
}

/**
 * 开始新建会话，等待用户发送首条消息后再调用接口
 */
function startNewSession() {
  if (isPendingNewSession.value) return
  isPendingNewSession.value = true
  activeConversationId.value = PENDING_CONVERSATION_ID
  chatResetSignal.value++
}

/**
 * 切换会话
 * @param conversationId 会话 id
 * @param resetChat 是否重置聊天区
 */
function selectConversation(conversationId: number, resetChat = true) {
  isPendingNewSession.value = false
  activeConversationId.value = conversationId
  if (resetChat) {
    chatResetSignal.value++
  }
}

provide(sessionContextKey, {
  activeConversationId,
  isPendingNewSession,
  chatResetSignal,
  lastCreatedConversation,
  startNewSession,
  selectConversation,
  sessionPanelCollapsed,
  toggleSessionPanelCollapsed,
})

/** 日志上下文，供聊天面板写入、日志面板展示 */
const logContext = createLogContext()
provide(logContextKey, logContext)

/** 构建日志上下文，供预览面板触发、日志面板悬浮框展示 */
const buildContext = createBuildContext()
provide(buildContextKey, buildContext)

watch(
  () => projectStore.currentProject?.id,
  () => {
    currentTemplateVersion.value = ''
    latestTemplateVersion.value = ''
    void refreshTemplateStatus()
  },
  { immediate: true },
)
/** 构建日志在右侧底部展开，保留当前面板和左侧对话。 */
watch(
  () => buildContext.running.value,
  (running) => {
    if (!running) return
    logMounted.value = true
    logVisible.value = true
    if (isMobileLayout.value) mobilePane.value = 'workspace'
  },
)

const tabs: TabItem[] = [
  { key: 'preview', label: '预览', icon: Monitor },
  { key: 'file', label: '文件', icon: Document },
  { key: 'image', label: '图像', icon: Picture },
]

/** 当前选中的 Tab 索引 */
const activeTab = ref(0)

/** Tab 滑动方向 */
type PanelSlideDirection = 'forward' | 'backward'

/** 面板切换动画时长（毫秒） */
const PANEL_TRANSITION_MS = 200

/** 正在退出的 Tab key */
const leavingTabKey = ref<string | null>(null)

/** 当前滑动方向 */
const slideDirection = ref<PanelSlideDirection>('forward')

/** 是否正在切换动画中 */
const isPanelTransitioning = ref(false)

/** 面板切换动画结束定时器 */
let panelTransitionTimer: ReturnType<typeof setTimeout> | null = null

/** 已挂载过的 Tab 面板（首次访问后保持挂载，避免切换丢失状态） */
const mountedTabKeys = ref<Set<string>>(new Set(['preview']))

/** 项目初始化中 */
const projectLoading = ref(true)

/** 项目初始化错误 */
const projectError = ref('')

/** 当前项目是否就绪 */
const projectReady = computed(() => !projectLoading.value && !projectError.value && !!projectStore.currentProject)

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
}

/** 当前选中 Tab 的内容标识 */
const activeTabKey = computed(() => tabs[activeTab.value]?.key ?? 'preview')

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
  if (leavingBuilder) return
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

    initialPrompt.value = takeProjectPrompt(projectId)
    activeConversationId.value = null
    isPendingNewSession.value = false
    chatResetSignal.value++
    if (initialPrompt.value) {
      startNewSession()
      mobilePane.value = 'chat'
    }
    if (leavingBuilder || Number(route.query.projectId) !== projectId) return
    projectStore.setCurrentProject(project)
  } catch (error) {
    projectError.value = error instanceof Error ? error.message : '项目信息加载失败'
  } finally {
    projectLoading.value = false
  }
}

/** 地址栏 projectId 变化时重新加载项目 */
watch(
  () => route.query.projectId,
  () => {
    void initCurrentProject()
  },
  { immediate: true },
)

/**
 * 开发热更新后可能短暂丢失 currentProject，自动重新拉取
 */
watch(
  () => projectStore.currentProject,
  (project) => {
    if (leavingBuilder || project || projectLoading.value || projectError.value) return
    void initCurrentProject()
  },
)

/** 离开 Builder 路由时再清空当前项目，避免 HMR 卸载组件时误清 store 导致白屏 */
onBeforeRouteLeave(() => {
  leavingBuilder = true
  projectStore.setCurrentProject(null)
})

onMounted(() => {
  narrowMediaQuery = window.matchMedia('(max-width: 1119px)')
  mobileMediaQuery = window.matchMedia('(max-width: 767px)')
  syncResponsiveLayout()
  narrowMediaQuery.addEventListener('change', syncResponsiveLayout)
  mobileMediaQuery.addEventListener('change', syncResponsiveLayout)
  window.addEventListener('keydown', handleShellKeydown)
})

onUnmounted(() => {
  leavingBuilder = true
  narrowMediaQuery?.removeEventListener('change', syncResponsiveLayout)
  mobileMediaQuery?.removeEventListener('change', syncResponsiveLayout)
  window.removeEventListener('keydown', handleShellKeydown)
  if (panelTransitionTimer) {
    clearTimeout(panelTransitionTimer)
  }
})
</script>

<template>
  <div v-if="projectLoading" class="builder-status">
    <span class="builder-status-mark" aria-hidden="true" />
    <strong>正在加载项目</strong>
  </div>
  <div v-else-if="projectError" class="builder-status builder-status--error">
    <span class="builder-status-mark" aria-hidden="true" />
    <strong>项目暂时无法打开</strong>
    <p>{{ projectError }}</p>
    <button type="button" class="builder-status-action" @click="handleBackHome">返回项目列表</button>
  </div>
  <div
    v-else-if="projectReady"
    :key="projectStore.currentProject?.id"
    ref="builderShellRef"
    class="container builder-shell"
    :class="[{ 'container--session-collapsed': sessionPanelCollapsed, 'builder-shell--resizing': resizing }, `builder-shell--mobile-${mobilePane}`]"
    :style="leftWidth ? { '--workspace-chat-width': `${leftWidth}px` } : undefined"
  >
    <header class="builder-topbar">
      <div class="builder-brand">
        <button type="button" class="builder-brand-back" title="返回项目列表" aria-label="返回项目列表" @click="handleBackHome">
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button type="button" class="builder-brand-mark" title="返回项目列表" aria-label="返回项目列表" @click="handleBackHome">
          <span aria-hidden="true" />
        </button>
      </div>

      <div class="builder-project-context">
        <button
          type="button"
          class="builder-project-title"
          :aria-label="`切换项目：${projectStore.currentProject?.title}`"
          aria-haspopup="dialog"
          :aria-expanded="projectSwitchVisible"
          @click="openProjectSwitcher"
        >
          <span>{{ projectStore.currentProject?.title }}</span
          ><SvgIcon name="chevron-down" />
        </button>
        <span class="builder-project-type" :class="`builder-project-type--${resolveProjectType(projectStore.currentProject?.type)}`">{{ projectTypeLabel }}</span>
      </div>

      <div class="builder-mobile-switch" role="group" aria-label="移动端工作区视图">
        <button type="button" :class="{ 'is-active': mobilePane === 'chat' }" :aria-pressed="mobilePane === 'chat'" @click="mobilePane = 'chat'">对话</button>
        <button type="button" :class="{ 'is-active': mobilePane === 'workspace' }" :aria-pressed="mobilePane === 'workspace'" @click="mobilePane = 'workspace'">工作区</button>
      </div>

      <div class="builder-topbar-actions">
        <span class="builder-online-state"><i /> 工作区已连接</span>
        <button
          ref="sessionToggleRef"
          type="button"
          class="builder-session-toggle-btn builder-topbar-session-toggle"
          :title="sessionPanelCollapsed ? '展开会话列表' : '收起会话列表'"
          :aria-label="sessionPanelCollapsed ? '展开会话列表' : '收起会话列表'"
          :aria-expanded="!sessionPanelCollapsed"
          aria-controls="builder-sessions"
          @click="toggleSessionPanelCollapsed"
        >
          <el-icon><ChatDotRound /></el-icon>
        </button>
        <ThemeToggle />
        <UserMenu show-name @profile-updated="handleUserProfileUpdated" />
      </div>
    </header>

    <button v-if="!sessionPanelCollapsed" type="button" class="builder-drawer-scrim" aria-label="关闭会话列表" @click="toggleSessionPanelCollapsed" />

    <section id="builder-sessions" class="left" :inert="sessionPanelCollapsed" aria-label="会话列表">
      <SessionPanel />
    </section>
    <main class="main chat-workspace" aria-label="项目对话">
      <ChatPanel
        :user-account-override="latestUserProfile?.account"
        :user-avatar-override="latestUserProfile?.avatar"
        :initial-prompt="initialPrompt"
        @initial-prompt-used="initialPrompt = ''"
      />
    </main>
    <div
      class="workspace-splitter"
      role="separator"
      tabindex="0"
      aria-label="调整对话与工作区宽度"
      aria-orientation="vertical"
      :aria-valuenow="splitPercent"
      :aria-valuemin="splitMinPercent"
      :aria-valuemax="splitMaxPercent"
      @pointerdown="split.start"
      @pointermove="split.move"
      @pointerup="split.finish"
      @pointercancel="split.finish"
      @lostpointercapture="split.finish"
      @keydown="split.keydown"
      @dblclick="split.reset"
    />
    <section class="right workspace-area" aria-label="项目工作区">
      <header class="workspace-toolbar">
        <div class="workspace-modes" role="tablist" aria-label="工作区视图">
          <button
            v-for="(tab, index) in tabs"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="activeTab === index"
            :aria-label="tab.label"
            :class="{ 'is-active': activeTab === index }"
            @click="switchTab(index)"
          >
            <el-icon><component :is="tab.icon" /></el-icon><span class="workspace-mode-label">{{ tab.label }}</span>
          </button>
        </div>
        <el-dropdown trigger="click" popper-class="workspace-settings-menu" @command="openSettings">
          <button
            type="button"
            class="workspace-icon-button workspace-settings-button"
            :aria-label="hasTemplateUpdate ? '项目设置菜单，有模板更新' : '项目设置菜单'"
            @click="refreshTemplateStatus"
          >
            <el-icon><Setting /></el-icon>
            <span v-if="hasTemplateUpdate" class="template-update-dot" aria-hidden="true" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="config"
                ><el-icon><Setting /></el-icon>项目设置</el-dropdown-item
              >
              <el-dropdown-item command="snapshot"
                ><el-icon><Camera /></el-icon>版本记录</el-dropdown-item
              >
              <el-dropdown-item command="temp"
                ><el-icon><CopyDocument /></el-icon
                ><span class="workspace-template-menu-label">项目模板<span v-if="hasTemplateUpdate" class="template-update-dot" aria-hidden="true" /></span
              ></el-dropdown-item>
            </el-dropdown-menu>
            <div class="workspace-settings-summary" role="group" aria-label="当前项目" :style="{ '--project-hue': projectCardHue(projectStore.currentProject?.id ?? 0) }">
              <span class="workspace-project-glyph" role="img" :aria-label="projectTypeLabel"
                ><SvgIcon :name="`project-${resolveProjectType(projectStore.currentProject?.type)}`"
              /></span>
              <div class="workspace-project-summary-copy">
                <strong>{{ projectStore.currentProject?.title }}</strong>
                <div v-if="currentTemplateVersion" class="workspace-project-meta">
                  <span :aria-label="`当前模板版本 ${currentTemplateVersion}`"
                    ><el-icon><CopyDocument /></el-icon>{{ currentTemplateVersion }}</span
                  >
                  <span v-if="hasTemplateUpdate" class="workspace-project-update">可更新至 {{ latestTemplateVersion }}</span>
                </div>
              </div>
            </div>
          </template>
        </el-dropdown>
        <div v-if="activeTabKey === 'preview'" class="workspace-device-switch" role="group" aria-label="预览设备">
          <el-tooltip content="桌面预览" placement="bottom"
            ><button type="button" class="workspace-icon-button" aria-label="桌面预览" :aria-pressed="previewDevice === 'desktop'" @click="previewDevice = 'desktop'">
              <el-icon><Monitor /></el-icon></button
          ></el-tooltip>
          <el-tooltip content="手机预览" placement="bottom"
            ><button type="button" class="workspace-icon-button" aria-label="手机预览" :aria-pressed="previewDevice === 'mobile'" @click="previewDevice = 'mobile'">
              <el-icon><Iphone /></el-icon></button
          ></el-tooltip>
        </div>
      </header>
      <div class="main-content workspace-content">
        <div class="main-content-viewport">
          <PreviewPanel
            v-if="shouldMountTabPanel('preview')"
            :device="previewDevice"
            class="main-content-panel"
            :class="getPanelTransitionClass('preview')"
            :inert="activeTabKey !== 'preview'"
            :aria-hidden="activeTabKey !== 'preview'"
          />
          <FilePanel
            v-if="shouldMountTabPanel('file')"
            class="main-content-panel"
            :class="getPanelTransitionClass('file')"
            :inert="activeTabKey !== 'file'"
            :aria-hidden="activeTabKey !== 'file'"
          />
          <ImagePanel
            v-if="shouldMountTabPanel('image')"
            class="main-content-panel"
            :class="getPanelTransitionClass('image')"
            :inert="activeTabKey !== 'image'"
            :aria-hidden="activeTabKey !== 'image'"
          />
        </div>
      </div>
      <section v-if="logMounted" v-show="logVisible" id="workspace-log" class="workspace-terminal" aria-label="运行日志"><LogPanel /></section>
      <footer class="workspace-footer">
        <button type="button" :aria-expanded="logVisible" aria-controls="workspace-log" @click="toggleLog">
          <el-icon><Notebook /></el-icon><span>运行日志</span>
        </button>
        <span>{{ settingsDialogVisible ? settingsTitles[settingsPanel] : tabs[activeTab]?.label }}</span>
      </footer>
    </section>
    <el-dialog v-model="projectSwitchVisible" class="project-switcher-dialog" title="切换项目" width="min(680px, calc(100vw - 32px))" :fullscreen="isMobileLayout" append-to-body>
      <el-input v-model="projectSwitchSearch" :prefix-icon="Search" clearable placeholder="搜索项目名称" aria-label="搜索项目名称" />
      <div v-loading="projectSwitchLoading" class="project-switch-list">
        <div v-if="selectableProjects.length" class="project-switch-grid">
          <button
            v-for="project in selectableProjects"
            :key="project.id"
            type="button"
            class="project-switch-option"
            :class="{ 'is-current': project.id === projectStore.currentProject?.id }"
            :style="{ '--project-hue': projectCardHue(project.id) }"
            :aria-label="`切换到${project.title}`"
            :aria-pressed="project.id === projectStore.currentProject?.id"
            @click="selectProject(project)"
          >
            <span class="workspace-project-glyph" aria-hidden="true"><SvgIcon :name="`project-${resolveProjectType(project.type)}`" /></span>
            <span class="project-switch-copy"
              ><strong>{{ project.title }}</strong
              ><small>{{ project.desc?.trim() || PROJECT_TYPE_LABEL[resolveProjectType(project.type)] }}</small></span
            >
            <el-icon v-if="project.id === projectStore.currentProject?.id" class="project-switch-current" aria-hidden="true"><Check /></el-icon>
          </button>
        </div>
        <div v-else-if="!projectSwitchLoading" class="project-switch-empty">{{ projectSwitchSearch.trim() ? '没有匹配的项目' : '暂无可切换的项目' }}</div>
      </div>
    </el-dialog>
    <el-dialog
      v-model="settingsDialogVisible"
      class="builder-settings-dialog"
      :title="settingsTitles[settingsPanel]"
      width="min(960px, calc(100vw - 32px))"
      :fullscreen="isMobileLayout"
      append-to-body
    >
      <div class="builder-shell builder-dialog-context">
        <ConfigPanel v-if="settingsMounted.has('config')" v-show="settingsPanel === 'config'" />
        <SnapshotPanel v-if="settingsMounted.has('snapshot')" v-show="settingsPanel === 'snapshot'" />
        <TempPanel
          v-if="settingsMounted.has('temp')"
          v-show="settingsPanel === 'temp'"
          :panel-active="settingsDialogVisible && settingsPanel === 'temp'"
          @version-updated="refreshTemplateStatus"
        />
      </div>
    </el-dialog>
  </div>
  <div v-else class="builder-status">
    <span class="builder-status-mark" aria-hidden="true" />
    <strong>正在恢复项目</strong>
  </div>
</template>

<style scoped>
.builder-status {
  position: relative;
  width: 100%;
  min-height: 100svh;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  background-color: var(--brand-canvas);
  background-image: linear-gradient(var(--brand-grid) 1px, transparent 1px), linear-gradient(90deg, var(--brand-grid) 1px, transparent 1px);
  background-size: 48px 48px;
  color: var(--brand-ink);
  font-family: var(--brand-font-body);
  text-align: center;
}

.builder-status-mark {
  display: grid;
  width: 48px;
  height: 48px;
  margin-bottom: 10px;
  place-items: center;
  border: 1px solid var(--brand-ink);
  border-radius: var(--brand-radius-md);
  background: var(--brand-panel);
  box-shadow: 5px 5px 0 var(--brand-ink);
}

.builder-status-mark::before {
  width: 29px;
  height: 29px;
  background: var(--brand-blue);
  content: '';
  mask: url('/svgs/ai-agent.svg') center / contain no-repeat;
}

.builder-status strong {
  font-family: var(--brand-font-display);
  font-size: 22px;
}

.builder-status p {
  max-width: 420px;
  color: var(--brand-muted);
  font-size: 13px;
  line-height: 1.6;
}

.builder-status--error {
  --brand-blue: var(--brand-coral);
}

.builder-status-action {
  min-height: 38px;
  margin-top: 10px;
  padding: 0 14px;
  border: 1px solid var(--brand-ink);
  border-radius: var(--brand-radius-sm);
  background: var(--brand-blue);
  box-shadow: 4px 4px 0 var(--brand-ink);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
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
  overflow: hidden;
  transition:
    flex 0.25s ease,
    width 0.25s ease,
    opacity 0.25s ease,
    border-color 0.25s ease;
}

.container--session-collapsed .left {
  flex: 0 0 0;
  width: 0;
  min-width: 0;
  opacity: 0;
  border-right-color: transparent;
  pointer-events: none;
}

.main {
  flex: 3;
  height: 100%;
  background-color: var(--app-surface);
  display: flex;
  flex-direction: column;
  transition: flex 0.25s ease;
}

.container--session-collapsed .main {
  flex: 4;
}

.main-tab {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--app-border);
}

.main-tab-session-toggle {
  align-self: center;
}

.main-tab-list {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 0;
}

.main-tab-item {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 1rem;
  padding: 0.5rem 1.5rem;
  color: var(--app-text-primary);
  font-weight: 700;
  cursor: pointer;
  transition: color 0.2s ease;
}

.main-tab-item-icon {
  flex-shrink: 0;
  font-size: 1rem;
  line-height: 1;
}

.main-tab-item-icon :deep(svg) {
  display: block;
}

.main-tab-item-label {
  line-height: 1.2;
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
  animation: panel-enter-forward 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: auto;
  z-index: 2;
  visibility: visible;
}

.main-content-panel--enter-backward {
  animation: panel-enter-backward 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: auto;
  z-index: 2;
  visibility: visible;
}

.main-content-panel--leave-forward {
  animation: panel-leave-forward 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none;
  z-index: 1;
  visibility: visible;
}

.main-content-panel--leave-backward {
  animation: panel-leave-backward 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  pointer-events: none;
  z-index: 1;
  visibility: visible;
}

@keyframes panel-enter-forward {
  from {
    transform: translateX(0.75rem);
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
    transform: translateX(-0.75rem);
    opacity: 0;
  }
}

@keyframes panel-enter-backward {
  from {
    transform: translateX(-0.75rem);
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
    transform: translateX(0.75rem);
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

<style src="./builder.css"></style>
<style src="./studio.css"></style>
