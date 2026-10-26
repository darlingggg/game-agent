<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Clock, Connection, Download, FolderOpened, Monitor, RefreshRight, WarningFilled } from '@element-plus/icons-vue'
import { showRequestError } from '@/ajax'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useBuildContext } from '@/builder/build/buildContext'
import { buildProjectStream } from '@/http/project'
import { getSnapshotList } from '@/http/snapshot'
import { useProjectStore } from '@/stores/project'
import { INDEX_HTML_PATH, parseProjectHtmlConfig } from '../config/projectHtmlConfig'
import { fetchProjectTempFileContent } from '../file/projectTempFiles'
import { PROJECT_FILES_CHANGED_EVENT } from '../snapshot/snapshotRestore'
import { PreviewBootTimeoutError, refreshProjectTempPreview, previewIframeReloadSignal, stopProjectTempPreview, startProjectTempPreview, type PreviewPhase } from './webcontainer'
import SvgIcon from '@/components/SvgIcon.vue'
import { claimPreviewOwner, releasePreviewOwner } from './previewOwner'

defineOptions({
  name: 'PreviewPanel',
})

withDefaults(defineProps<{ device?: 'desktop' | 'mobile' }>(), { device: 'desktop' })

const projectStore = useProjectStore()
const buildContext = useBuildContext()
const previewOwner = claimPreviewOwner()

/** 版本快照最大保存数量 */
const MAX_SNAPSHOT_COUNT = 5

/** 快照类型：构建部署产生的版本快照 */
const SNAPSHOT_TYPE_USER = 0

/** 当前项目部署链接（projectItem.link） */
const deployLink = computed(() => projectStore.currentProject?.link?.trim() ?? '')

/** 是否可复制部署链接 */
const canCopyDeployLink = computed(() => deployLink.value.length > 0)

/** 快照版本数是否已达上限 */
const isSnapshotLimitReached = computed(() => buildContext.snapshotVersionCount.value >= MAX_SNAPSHOT_COUNT)

/** 构建按钮是否禁用 */
const isBuildDisabled = computed(() => building.value || buildContext.running.value || isSnapshotLimitReached.value)

/** 构建按钮提示文案 */
const buildTooltip = computed(() => (isSnapshotLimitReached.value ? '版本快照最多5个，请先清理旧版本' : '构建部署'))

/** 构建图标是否播放 3D 旋转动画 */
const isBuildAnimating = computed(() => building.value || buildContext.running.value)

/** 是否正在构建部署 */
const building = ref(false)

/** 构建中止控制器 */
let buildAbortController: AbortController | null = null

/** iframe 预览地址 */
const previewUrl = ref('')

/** iframe 强制重载 key */
const iframeKey = ref(0)

/** 项目标题，来自 index.html 的 title */
const projectTitle = ref('')

/** 加载状态文案 */
const statusText = ref('正在准备预览...')

/** 当前加载步骤决定占位图标 */
const statusPhase = ref<PreviewPhase>('preparing')
const statusIcon = computed(
  () =>
    ({
      preparing: Clock,
      initializing: Connection,
      mounting: FolderOpened,
      installing: Download,
      starting: Monitor,
      refreshing: RefreshRight,
      ready: Monitor,
    })[statusPhase.value],
)

/** 错误信息 */
const errorText = ref('')

/** 初始化超时后需重载页面以清除 WebContainer SDK 内部的等待状态 */
const bootTimedOut = ref(false)

/** 刷新进行中 */
const refreshing = ref(false)

/** 手动重新挂载进行中 */
const remounting = ref(false)

/** 预览加载令牌，用于忽略过期请求的结果 */
let previewLoadToken = 0

/**
 * 加载项目标题
 */
async function loadProjectTitle() {
  const projectId = projectStore.currentProject?.id
  try {
    const html = await fetchProjectTempFileContent(INDEX_HTML_PATH)
    if (projectStore.currentProject?.id !== projectId) return
    projectTitle.value = parseProjectHtmlConfig(html).name || '未命名项目'
  } catch {
    if (projectStore.currentProject?.id !== projectId) return
    projectTitle.value = '未命名项目'
  }
}

/**
 * 启动预览：停止旧项目进程，复用 WebContainer 加载当前项目
 */
async function loadPreview() {
  const loadToken = ++previewLoadToken

  previewUrl.value = ''
  errorText.value = ''
  bootTimedOut.value = false
  statusText.value = '正在准备预览...'
  statusPhase.value = 'preparing'
  iframeKey.value += 1

  stopProjectTempPreview()

  try {
    const url = await startProjectTempPreview((status, phase) => {
      if (loadToken === previewLoadToken) {
        statusText.value = status
        statusPhase.value = phase
      }
    })

    if (loadToken !== previewLoadToken) return

    previewUrl.value = url
    statusText.value = ''
  } catch (error) {
    if (loadToken !== previewLoadToken) return
    if (error instanceof Error && error.message === '预览已取消') return

    statusText.value = ''
    const message = error instanceof Error ? error.message : ''
    const needsReload = /only a single webcontainer instance/i.test(message)
    bootTimedOut.value = error instanceof PreviewBootTimeoutError || needsReload
    errorText.value = needsReload ? '预览运行环境需要重置，请重新加载页面' : /[\u4e00-\u9fff]/.test(message) ? message : '预览启动失败，请重试'
    if (message && !/[\u4e00-\u9fff]/.test(message)) console.error('[项目预览]', error)
  }
}

watch(
  () => projectStore.currentProject?.id,
  (projectId) => {
    if (!projectId) return
    void loadProjectTitle()
    void loadPreview()
    void refreshSnapshotVersionCount()
  },
  { immediate: true },
)

watch(
  () => buildContext.buildCompletedSignal.value,
  () => {
    void refreshSnapshotVersionCount()
  },
)

/**
 * 刷新当前项目快照版本数量
 */
async function refreshSnapshotVersionCount() {
  const currentProjectId = projectStore.currentProject?.id
  if (!currentProjectId) {
    buildContext.setSnapshotVersionCount(0)
    return
  }

  try {
    const list = await getSnapshotList({ projectId: currentProjectId })
    const versionCount = new Set(list.filter((item) => item.type === SNAPSHOT_TYPE_USER).map((item) => item.version)).size
    if (projectStore.currentProject?.id !== currentProjectId) return
    buildContext.setSnapshotVersionCount(versionCount)
  } catch {
    // 列表加载失败时不阻断构建，仅保留已有计数
  }
}

/** AI 写入文件后防抖重载 iframe，使 Tailwind 样式生效 */
watch(previewIframeReloadSignal, () => {
  if (previewUrl.value) {
    iframeKey.value += 1
  }
})

onUnmounted(() => {
  previewLoadToken++
  buildAbortController?.abort()
  buildAbortController = null
  if (releasePreviewOwner(previewOwner)) stopProjectTempPreview()
  window.removeEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged)
})

/**
 * 项目文件变更后刷新预览标题（模板升级、版本还原等）
 */
async function handleProjectFilesChanged(event: Event) {
  const loadToken = previewLoadToken
  void loadProjectTitle()
  const detail = event instanceof CustomEvent ? (event.detail as { previewAlreadySynced?: boolean } | undefined) : undefined
  if (!previewUrl.value || detail?.previewAlreadySynced) return

  try {
    await refreshProjectTempPreview()
    if (loadToken !== previewLoadToken) return
    iframeKey.value += 1
  } catch (error) {
    console.warn('[Preview] 项目文件变更后刷新失败', error)
  }
}

onMounted(() => {
  window.addEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged)
})

/**
 * 刷新预览：重新挂载 WebContainer 文件并 reload iframe
 */
async function handleRefresh() {
  if (refreshing.value || remounting.value) return

  if (bootTimedOut.value) {
    window.location.reload()
    return
  }

  refreshing.value = true
  errorText.value = ''
  const loadToken = previewLoadToken

  try {
    if (!previewUrl.value) {
      const url = await startProjectTempPreview((status, phase) => {
        if (loadToken !== previewLoadToken) return
        statusText.value = status
        statusPhase.value = phase
      })
      if (loadToken !== previewLoadToken) return
      previewUrl.value = url
      statusText.value = ''
      await loadProjectTitle()
      return
    }

    await refreshProjectTempPreview((status, phase) => {
      if (loadToken !== previewLoadToken) return
      statusText.value = status
      statusPhase.value = phase
    })
    if (loadToken !== previewLoadToken) return
    await loadProjectTitle()
    if (loadToken !== previewLoadToken) return
    statusText.value = ''
    iframeKey.value += 1
  } catch (error) {
    if (loadToken !== previewLoadToken) return
    statusText.value = ''
    bootTimedOut.value = error instanceof PreviewBootTimeoutError
    errorText.value = error instanceof Error ? error.message : '预览刷新失败'
  } finally {
    refreshing.value = false
  }
}

/** 清理旧项目文件并重新挂载、安装依赖 */
async function handleRemount() {
  if (remounting.value || refreshing.value) return
  if (bootTimedOut.value) {
    window.location.reload()
    return
  }

  remounting.value = true
  try {
    await loadPreview()
    await loadProjectTitle()
  } finally {
    remounting.value = false
  }
}

/**
 * 复制部署链接到剪贴板
 */
async function handleShare() {
  if (!canCopyDeployLink.value) return

  try {
    await navigator.clipboard.writeText(deployLink.value)
    ElMessage.success('链接已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动复制链接')
  }
}

/**
 * 点击构建按钮
 */
function handleBuildClick() {
  if (isSnapshotLimitReached.value) {
    ElMessage.warning('版本快照最多5个，请先清理旧版本')
    return
  }
  void handleBuild()
}

/**
 * 构建并部署项目（SSE 流式日志）
 */
async function handleBuild() {
  if (building.value || buildContext.running.value || isSnapshotLimitReached.value) return

  const currentProject = projectStore.currentProject
  if (!currentProject?.id) {
    ElMessage.warning('当前项目未就绪')
    return
  }

  let dir = ''
  try {
    dir = projectStore.requireProjectDirPath()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目目录未就绪')
    return
  }

  building.value = true
  buildContext.openForBuild()
  buildAbortController?.abort()
  buildAbortController = new AbortController()

  try {
    await buildProjectStream({
      dir,
      projectId: currentProject.id,
      signal: buildAbortController.signal,
      onEvent: (event) => {
        if (event.event === 'error') {
          const message = typeof event.data === 'string' ? event.data : '构建失败'
          showRequestError(message)
          buildContext.handleBuildEvent({ event: 'text', data: message })
          throw new Error(message)
        }

        const doneResult = buildContext.handleBuildEvent(event)
        const deployLink = doneResult?.link || doneResult?.deploy?.url
        if (deployLink) {
          projectStore.patchProjectDeploy(currentProject.id, {
            link: deployLink,
            currentVersion: currentProject.currentVersion,
          })
        }
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    buildContext.handleBuildEvent({ event: 'text', data: error instanceof Error ? error.message : '构建失败' })
  } finally {
    buildContext.finishBuild()
    building.value = false
    buildAbortController = null
  }
}
</script>

<template>
  <div class="preview-panel" :class="`preview-panel--${device}`">
    <div class="phone-container">
      <div class="phone-frame">
        <div v-if="device === 'mobile'" class="phone-notch" aria-hidden="true" />
        <div class="phone-screen">
          <template v-if="previewUrl">
            <header class="preview-app-header">
              <h3 class="preview-app-title">{{ projectTitle }}</h3>
            </header>
            <iframe :key="iframeKey" class="preview-iframe" :src="previewUrl" title="项目预览" />
          </template>
          <div v-else-if="errorText" class="preview-placeholder preview-placeholder--error" role="alert">
            <el-icon class="preview-placeholder-icon" aria-hidden="true"><WarningFilled /></el-icon>
            <span class="preview-placeholder-text">{{ errorText }}</span>
            <button type="button" class="preview-placeholder-retry" @click="handleRefresh">
              <el-icon aria-hidden="true"><RefreshRight /></el-icon>
              <span>{{ bootTimedOut ? '重新加载' : '重试' }}</span>
            </button>
          </div>
          <div v-else class="preview-placeholder" role="status" aria-live="polite">
            <el-icon class="preview-placeholder-icon" :class="`preview-placeholder-icon--${statusPhase}`" aria-hidden="true">
              <component :is="statusIcon" />
            </el-icon>
            <span class="preview-placeholder-text">{{ statusText }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="preview-dock" role="toolbar" aria-label="预览操作">
      <div class="preview-dock-glass">
        <el-tooltip :content="buildTooltip" placement="top" :show-after="200">
          <span class="preview-dock-tooltip-trigger">
            <button type="button" class="preview-dock-btn preview-dock-btn--build" :disabled="isBuildDisabled" title="构建部署" aria-label="构建部署" @click="handleBuildClick">
              <span class="preview-dock-build-wrap" :class="{ 'preview-dock-build-wrap--building': isBuildAnimating }">
                <SvgIcon name="build-wireframe" class="preview-dock-build-icon preview-dock-build-wireframe" />
                <SvgIcon name="build-face" class="preview-dock-build-icon preview-dock-build-face" />
              </span>
            </button>
          </span>
        </el-tooltip>
        <el-tooltip :content="canCopyDeployLink ? '复制部署链接' : '暂无部署链接'" placement="top" :show-after="200">
          <span class="preview-dock-tooltip-trigger">
            <button type="button" class="preview-dock-btn" :disabled="!canCopyDeployLink" title="复制部署链接" aria-label="复制部署链接" @click="handleShare">
              <SvgIcon name="link" class="preview-dock-icon" />
            </button>
          </span>
        </el-tooltip>
        <el-tooltip content="重新挂载项目并安装依赖" placement="top" :show-after="200">
          <button
            type="button"
            class="preview-dock-btn"
            :class="{ 'preview-dock-btn--remounting': remounting }"
            :disabled="remounting || refreshing || (!previewUrl && !errorText)"
            title="重新挂载项目并安装依赖"
            aria-label="重新挂载项目并安装依赖"
            @click="handleRemount"
          >
            <el-icon class="preview-dock-icon"><FolderOpened /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip content="刷新预览" placement="top" :show-after="200">
          <button
            type="button"
            class="preview-dock-btn"
            :class="{ 'preview-dock-btn--loading': refreshing }"
            :disabled="refreshing || remounting"
            title="刷新预览"
            aria-label="刷新预览"
            @click="handleRefresh"
          >
            <SvgIcon name="refresh" class="preview-dock-icon" />
          </button>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--app-bg-muted);
}

.preview-dock {
  z-index: 2;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 0.25rem 1rem max(1rem, env(safe-area-inset-bottom));
}

.preview-dock-glass {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 100%;
  padding: 0.375rem;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 999px;
  background: rgba(226, 235, 248, 0.76);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 -1px 0 rgba(255, 255, 255, 0.14),
    0 12px 30px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
}

.preview-dock-glass::before {
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.24), transparent 62%);
  content: '';
  pointer-events: none;
}

.preview-dock-tooltip-trigger {
  position: relative;
  z-index: 1;
  display: inline-flex;
}

.preview-dock-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: #26364e;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.preview-dock-btn--build {
  background: rgba(130, 173, 255, 0.18);
}

.preview-dock-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.27);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.46);
}

.preview-dock-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.preview-dock-btn:focus-visible {
  outline: 2px solid #a8c9ff;
  outline-offset: 2px;
}

.preview-dock-btn:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.preview-dock-build-wrap {
  position: relative;
  display: inline-flex;
  width: 19px;
  height: 19px;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  --build-icon-wireframe: #26364e;
  --build-icon-face-idle: #ecf3ff;
  --build-icon-face-dark: #26364e;
}

.preview-dock-build-wrap--building {
  animation: preview-build-scale 2s ease-in-out infinite;
}

.preview-dock-build-wrap--building .preview-dock-build-face {
  animation: preview-build-face-color 4s ease-in-out infinite;
}

.preview-dock-build-icon {
  position: absolute;
  inset: 0;
  width: 19px;
  height: 19px;
}

.preview-dock-build-wireframe {
  fill: var(--build-icon-wireframe);
}

.preview-dock-build-face {
  fill: var(--build-icon-face-idle);
}

@keyframes preview-build-scale {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.18);
  }
}

@keyframes preview-build-face-color {
  0%,
  100% {
    fill: var(--build-icon-face-idle);
  }

  25% {
    fill: #409eff;
  }

  50% {
    fill: #1a8f5c;
  }

  75% {
    fill: var(--build-icon-face-dark);
  }
}

.preview-dock-btn--loading .preview-dock-icon {
  animation: preview-spin 2s linear infinite;
}

.preview-dock-btn--remounting .preview-dock-icon {
  animation: preview-status-pulse 1.5s ease-in-out infinite;
}

.preview-dock-icon {
  width: 21px;
  height: 21px;
}

@media (max-width: 767px) {
  .preview-dock {
    padding-bottom: max(56px, env(safe-area-inset-bottom));
  }
}

@keyframes preview-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.phone-container {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem 1rem 0.25rem;
}

.phone-frame {
  height: 100%;
  width: auto;
  max-width: 100%;
  aspect-ratio: 8 / 16;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  border: 2px solid #1a1a1a;
  border-radius: 2.5rem;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.phone-notch {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 0.625rem 0 0.375rem;
}

.phone-notch::before {
  content: '';
  width: 6.5rem;
  height: 1.625rem;
  background-color: #000;
  border-radius: 999px;
}

.phone-screen {
  flex: 1;
  min-height: 0;
  background-color: #fff;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.preview-app-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid #f0f0f0;
  background-color: #fff;
}

.preview-app-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #1a1c1e;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-iframe {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: none;
  display: block;
  background-color: #fff;
}

.preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  color: #1a1c1e;
  font-size: 0.85rem;
  text-align: center;
}

.preview-placeholder-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.preview-placeholder-icon--preparing,
.preview-placeholder-icon--initializing,
.preview-placeholder-icon--mounting,
.preview-placeholder-icon--installing,
.preview-placeholder-icon--starting {
  color: var(--app-accent);
  animation: preview-status-pulse 1.5s ease-in-out infinite;
}

.preview-placeholder-icon--refreshing {
  color: var(--app-accent);
  animation: preview-spin 1.2s linear infinite;
}

@keyframes preview-status-pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.92);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.preview-placeholder-text {
  max-width: 100%;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.preview-placeholder--error {
  color: var(--app-error);
}

.preview-placeholder-retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--app-border-strong);
  border-radius: 6px;
  background: #fff;
  color: #1a1c1e;
  font: inherit;
  cursor: pointer;
}

.preview-placeholder-retry:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

@media (prefers-reduced-motion: reduce) {
  .preview-placeholder-icon {
    animation: none;
  }
}
</style>
