<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ArrowDown, Clock, Connection, CopyDocument, Download, FolderOpened, Monitor, RefreshRight, TopRight, WarningFilled } from '@element-plus/icons-vue'
import { showRequestError } from '@/ajax'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useBuildContext } from '@/builder/build/buildContext'
import { buildProjectStream } from '@/http/project'
import { getSnapshotList } from '@/http/snapshot'
import { useProjectStore } from '@/stores/project'
import { INDEX_HTML_PATH, parseProjectHtmlConfig } from '../config/projectHtmlConfig'
import { fetchProjectTempFileContent } from '../file/projectTempFiles'
import { PROJECT_FILES_CHANGED_EVENT } from '../snapshot/snapshotRestore'
import { refreshProjectTempPreview, previewIframeReloadSignal, stopProjectTempPreview, startProjectTempPreview, type PreviewPhase } from './webcontainer'
import SvgIcon from '@/components/SvgIcon.vue'
import { claimPreviewOwner, releasePreviewOwner } from './previewOwner'
import { useCompatiblePreview } from './useCompatiblePreview'
import { notifyPreviewChange } from './previewEvents'

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
const compatibility = useCompatiblePreview(previewUrl, iframeKey)
const { enabled: compatiblePreview, description: remoteDescription, updatedAt: remoteUpdatedAt, isStale: remoteIsStale, frame: previewFrame, frameError } = compatibility
const previewError = computed(() => (compatiblePreview.value ? compatibility.error.value : errorText.value))
const previewStatus = computed(() => (compatiblePreview.value ? remoteDescription.value : statusText.value))
const remoteStatus = computed(() => {
  if (previewError.value || frameError.value) return 'error'
  if (compatibility.busy.value) return 'working'
  return remoteIsStale.value ? 'stale' : 'ready'
})
const remoteStatusLabel = computed(() => ({ error: '更新异常', working: '更新中', stale: '待更新', ready: '已更新' })[remoteStatus.value])

async function startCompatiblePreview(loadToken: number) {
  if (loadToken !== previewLoadToken) return
  stopProjectTempPreview()
  errorText.value = ''
  await compatibility.start()
}

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
  compatibility.stop()

  previewUrl.value = ''
  errorText.value = ''
  statusText.value = '正在准备预览...'
  statusPhase.value = 'preparing'
  iframeKey.value += 1

  stopProjectTempPreview()

  if (compatibility.remembered()) {
    await startCompatiblePreview(loadToken)
    return
  }

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

    console.warn('[项目预览] 本地启动失败，切换兼容预览', error)
    await startCompatiblePreview(loadToken)
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
  if (previewUrl.value && !compatiblePreview.value) {
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
  if (compatiblePreview.value) {
    if (!detail?.previewAlreadySynced) notifyPreviewChange(projectStore.currentProject?.id)
    return
  }
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
  if (compatiblePreview.value) {
    await compatibility.refresh()
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
    errorText.value = error instanceof Error ? error.message : '预览刷新失败'
    await startCompatiblePreview(loadToken)
  } finally {
    refreshing.value = false
  }
}

/** 清理旧项目文件并重新挂载、安装依赖 */
async function handleRemount() {
  if (remounting.value || refreshing.value) return
  if (compatiblePreview.value) {
    compatibility.retryRealtime()
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

  building.value = true
  buildContext.openForBuild()
  buildAbortController?.abort()
  buildAbortController = new AbortController()

  try {
    await buildProjectStream({
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
        <div v-if="compatiblePreview" class="preview-status" role="status" aria-live="polite">
          <el-popover trigger="click" placement="bottom" :width="280" :show-arrow="false" popper-class="preview-status-popover">
            <template #reference>
              <button type="button" class="preview-status-tag" :class="`preview-status--${remoteStatus}`" :aria-label="`兼容预览，${remoteDescription}，查看详情`">
                <span class="preview-status-dot" aria-hidden="true" />
                <span class="preview-status-name">兼容预览</span>
                <span class="preview-status-label">{{ remoteStatusLabel }}</span>
                <el-icon class="preview-status-chevron" aria-hidden="true"><ArrowDown /></el-icon>
              </button>
            </template>
            <div class="preview-status-details" :class="`preview-status--${remoteStatus}`">
              <strong class="preview-status-heading"><span class="preview-status-dot" aria-hidden="true" />{{ remoteStatusLabel }}</strong>
              <p class="preview-status-description">{{ remoteDescription }}</p>
              <p v-if="remoteUpdatedAt" class="preview-status-time">{{ remoteIsStale ? '当前显示较早版本 · ' : '更新于 ' }}{{ remoteUpdatedAt }}</p>
            </div>
          </el-popover>
        </div>
        <div class="phone-screen">
          <header v-if="previewUrl || compatiblePreview" class="preview-app-header" :class="{ 'preview-app-header--compatible': compatiblePreview && device === 'desktop' }">
            <h3 class="preview-app-title" :title="projectTitle || projectStore.currentProject?.title">{{ projectTitle || projectStore.currentProject?.title || '项目预览' }}</h3>
          </header>
          <template v-if="previewUrl">
            <iframe ref="previewFrame" :key="iframeKey" class="preview-iframe" :src="previewUrl" title="项目预览" />
          </template>
          <div v-else-if="previewError" class="preview-placeholder preview-placeholder--error" role="alert">
            <el-icon class="preview-placeholder-icon" aria-hidden="true"><WarningFilled /></el-icon>
            <span class="preview-placeholder-text">{{ previewError }}</span>
            <button type="button" class="preview-placeholder-retry" @click="handleRefresh">
              <el-icon aria-hidden="true"><RefreshRight /></el-icon>
              <span>重试</span>
            </button>
          </div>
          <div v-else class="preview-placeholder" role="status" aria-live="polite">
            <el-icon class="preview-placeholder-icon" :class="`preview-placeholder-icon--${statusPhase}`" aria-hidden="true">
              <component :is="statusIcon" />
            </el-icon>
            <span class="preview-placeholder-text">{{ previewStatus }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="preview-controls">
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
          <template v-if="compatiblePreview">
            <span class="preview-dock-divider" aria-hidden="true" />
            <el-tooltip content="打开预览" placement="top" :show-after="200">
              <span class="preview-dock-tooltip-trigger">
                <a
                  class="preview-dock-btn"
                  :class="{ 'is-disabled': !previewUrl }"
                  :href="previewUrl || undefined"
                  :aria-disabled="!previewUrl"
                  :tabindex="previewUrl ? 0 : -1"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="打开预览"
                  aria-label="打开预览"
                >
                  <el-icon class="preview-dock-icon"><TopRight /></el-icon>
                </a>
              </span>
            </el-tooltip>
            <el-tooltip content="复制预览链接" placement="top" :show-after="200">
              <span class="preview-dock-tooltip-trigger">
                <button type="button" class="preview-dock-btn" :disabled="!previewUrl" title="复制预览链接" aria-label="复制预览链接" @click="compatibility.copyLink">
                  <el-icon class="preview-dock-icon"><CopyDocument /></el-icon>
                </button>
              </span>
            </el-tooltip>
          </template>
          <el-tooltip :content="compatiblePreview ? '重试实时预览' : '重新挂载项目并安装依赖'" placement="top" :show-after="200">
            <button
              type="button"
              class="preview-dock-btn"
              :class="{ 'preview-dock-btn--remounting': remounting }"
              :disabled="remounting || refreshing || (!previewUrl && !previewError)"
              :title="compatiblePreview ? '重试实时预览' : '重新挂载项目并安装依赖'"
              :aria-label="compatiblePreview ? '重试实时预览' : '重新挂载项目并安装依赖'"
              @click="handleRemount"
            >
              <span v-if="compatiblePreview" class="preview-realtime-icon" aria-hidden="true">
                <el-icon class="preview-realtime-monitor"><Monitor /></el-icon>
                <el-icon class="preview-realtime-retry"><RefreshRight /></el-icon>
              </span>
              <el-icon v-else class="preview-dock-icon"><FolderOpened /></el-icon>
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
  </div>
</template>

<style scoped>
.preview-panel {
  container: project-preview / inline-size;
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
  padding: 0;
}

.preview-controls {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 14px;
  padding: 6px 16px max(12px, env(safe-area-inset-bottom));
}

.preview-status-tag,
.preview-status-details {
  --preview-status-color: var(--app-accent);
}

.preview-status {
  position: absolute;
  z-index: 2;
  top: 8px;
  right: 12px;
  display: inline-flex;
  flex-shrink: 0;
}

.preview-status--ready {
  --preview-status-color: var(--brand-success);
}
.preview-status--error {
  --preview-status-color: var(--app-error);
}
.preview-status--stale {
  --preview-status-color: light-dark(#9a6700, #e5b96a);
}

.preview-status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--preview-status-color) 24%, var(--app-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--preview-status-color) 5%, var(--app-surface));
  color: var(--app-text-primary);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.preview-status-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-status-tag:hover {
  border-color: var(--preview-status-color);
}
.preview-status-tag:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 3px;
}
.preview-status-label {
  color: var(--preview-status-color);
  font-size: 11px;
}
.preview-status-chevron {
  color: var(--app-text-muted);
  font-size: 11px;
}
.preview-status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--preview-status-color);
}
.preview-status--working .preview-status-dot {
  animation: preview-status-pulse 1.5s ease-in-out infinite;
}

:global(.preview-status-popover.el-popper) {
  max-width: calc(100vw - 24px);
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface);
  color: var(--app-text-primary);
  box-shadow: var(--brand-shadow-float);
}

.preview-status-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-primary);
  font-size: 13px;
}
.preview-status-description {
  margin: 10px 0 0;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.preview-status-time {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
  color: var(--app-text-muted);
  font-size: 11px;
}
.preview-dock-divider {
  z-index: 1;
  height: 18px;
  width: 1px;
  margin: 0 3px;
  background: var(--app-border-strong);
}

.preview-realtime-icon {
  position: relative;
  width: 24px;
  height: 24px;
}

.preview-realtime-monitor {
  position: absolute;
  top: 1px;
  left: 0;
  font-size: 19px;
}

.preview-realtime-retry {
  position: absolute;
  right: -1px;
  bottom: 0;
  border-radius: 50%;
  background: var(--app-surface);
  box-shadow: 0 0 0 2px var(--app-surface);
  font-size: 12px;
}

.preview-dock-glass {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 100%;
  padding: 0.375rem;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
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
  color: var(--app-text-secondary);
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

.preview-dock-btn.is-disabled {
  pointer-events: none;
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
  --build-icon-wireframe: var(--app-text-primary);
  --build-icon-face-idle: var(--app-surface);
  --build-icon-face-dark: var(--app-text-primary);
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
  .preview-controls {
    gap: 8px;
    padding-inline: 10px;
  }
  .preview-status-tag {
    min-height: 28px;
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
  position: relative;
  height: 100%;
  width: auto;
  max-width: 100%;
  aspect-ratio: 8 / 16;
  display: flex;
  flex-direction: column;
  background-color: var(--app-surface);
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
  width: 86px;
  height: 22px;
  background-color: #000;
  border-radius: 999px;
}

.phone-screen {
  flex: 1;
  min-height: 0;
  background-color: var(--app-surface);
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
  gap: 10px;
  min-height: 44px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border);
  background-color: var(--app-surface);
}

/* 两侧对称留位，标题始终相对整个 PC 标题栏居中。 */
.preview-app-header--compatible {
  padding-inline: 152px;
}

.preview-panel--mobile .preview-status {
  top: 9px;
  right: 10px;
  max-width: calc((100% - 86px) / 2 - 16px);
}

.preview-panel--mobile .preview-status-tag {
  max-width: 100%;
  min-height: 22px;
  gap: 4px;
  padding: 3px 10px;
  margin-right: 8px;
  margin-top: -2px;
  font-size: 11px;
}

.preview-panel--mobile .preview-status-dot {
  width: 5px;
  height: 5px;
}

.preview-panel--mobile .preview-status-label,
.preview-panel--mobile .preview-status-chevron {
  display: none;
}

@container project-preview (max-width: 440px) {
  .preview-app-header--compatible {
    padding-inline: 88px;
  }

  .preview-panel--desktop .preview-status-tag {
    gap: 4px;
    padding-inline: 5px;
    font-size: 11px;
  }

  .preview-panel--desktop .preview-status-label,
  .preview-panel--desktop .preview-status-chevron {
    display: none;
  }
}

.preview-app-title {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--app-text-primary);
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
  color: var(--app-text-secondary);
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
  background: var(--app-surface);
  color: var(--app-text-primary);
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
  .preview-status-dot {
    animation: none;
  }
}
</style>
