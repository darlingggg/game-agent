<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { showRequestError } from '@/ajax'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useBuildContext } from '@/builder/build/buildContext'
import { buildProjectStream } from '@/http/project'
import { getSnapshotList } from '@/http/snapshot'
import { useProjectStore } from '@/stores/project'
import { INDEX_HTML_PATH, parseProjectHtmlConfig } from '../config/projectHtmlConfig'
import { fetchProjectTempFileContent } from '../file/projectTempFiles'
import { PROJECT_FILES_CHANGED_EVENT } from '../snapshot/snapshotRestore'
import { refreshProjectTempPreview, previewIframeReloadSignal, resetProjectTempPreview, startProjectTempPreview } from './webcontainer'
import SvgIcon from '@/components/SvgIcon.vue'

defineOptions({
  name: 'PreviewPanel',
})

const projectStore = useProjectStore()
const buildContext = useBuildContext()

/** 版本快照最大保存数量 */
const MAX_SNAPSHOT_COUNT = 5

/** 当前项目部署链接（projectItem.link） */
const deployLink = computed(() => projectStore.currentProject?.link?.trim() ?? '')

/** 是否可复制部署链接 */
const canCopyDeployLink = computed(() => deployLink.value.length > 0)

/** 快照版本数是否已达上限 */
const isSnapshotLimitReached = computed(() => buildContext.snapshotVersionCount.value >= MAX_SNAPSHOT_COUNT)

/** 构建按钮是否禁用 */
const isBuildDisabled = computed(() => building.value || buildContext.running.value || isSnapshotLimitReached.value)

/** 构建按钮提示文案 */
const buildTooltip = computed(() => (isSnapshotLimitReached.value ? '版本数最多5个，请先清理旧版本' : '构建部署'))

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

/** 错误信息 */
const errorText = ref('')

/** 刷新进行中 */
const refreshing = ref(false)

/** 预览工具栏状态 */
const previewStatus = computed(() => {
  if (errorText.value) return { label: 'ERROR', kind: 'error' }
  if (previewUrl.value) return { label: 'LIVE', kind: 'live' }
  return { label: 'STARTING', kind: 'loading' }
})

/** 预览加载令牌，用于忽略过期请求的结果 */
let previewLoadToken = 0

/**
 * 加载项目标题
 */
async function loadProjectTitle() {
  try {
    const html = await fetchProjectTempFileContent(INDEX_HTML_PATH)
    projectTitle.value = parseProjectHtmlConfig(html).name || '未命名项目'
  } catch {
    projectTitle.value = '未命名项目'
  }
}

/**
 * 启动预览：先销毁旧 WebContainer，再重新加载当前项目
 */
async function loadPreview() {
  const loadToken = ++previewLoadToken

  previewUrl.value = ''
  errorText.value = ''
  statusText.value = '正在准备预览...'
  iframeKey.value += 1

  resetProjectTempPreview()

  try {
    const url = await startProjectTempPreview((status) => {
      if (loadToken === previewLoadToken) {
        statusText.value = status
      }
    })

    if (loadToken !== previewLoadToken) return

    previewUrl.value = url
    statusText.value = ''
  } catch (error) {
    if (loadToken !== previewLoadToken) return
    if (error instanceof Error && error.message === '预览已取消') return

    statusText.value = ''
    errorText.value = error instanceof Error ? error.message : '预览启动失败'
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
    const versionCount = new Set(list.map((item) => item.version)).size
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
  resetProjectTempPreview()
  window.removeEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged)
})

/**
 * 项目文件变更后刷新预览标题（模板升级、版本还原等）
 */
function handleProjectFilesChanged() {
  void loadProjectTitle()
}

onMounted(() => {
  window.addEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged)
})

/**
 * 刷新预览：重新挂载 WebContainer 文件并 reload iframe
 */
async function handleRefresh() {
  if (refreshing.value) return

  refreshing.value = true
  errorText.value = ''

  try {
    if (!previewUrl.value) {
      previewUrl.value = await startProjectTempPreview((status) => {
        statusText.value = status
      })
      statusText.value = ''
      await loadProjectTitle()
      return
    }

    await refreshProjectTempPreview((status) => {
      statusText.value = status
    })
    await loadProjectTitle()
    statusText.value = ''
    iframeKey.value += 1
  } catch (error) {
    statusText.value = ''
    errorText.value = error instanceof Error ? error.message : '预览刷新失败'
  } finally {
    refreshing.value = false
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
    ElMessage.warning('版本数最多5个，请先清理旧版本')
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
  <div class="preview-panel">
    <header class="preview-toolbar">
      <div class="preview-toolbar-heading">
        <h2 class="preview-toolbar-title">实时预览</h2>
        <span class="preview-status" :class="`preview-status--${previewStatus.kind}`"> <i aria-hidden="true" />{{ previewStatus.label }} </span>
      </div>
      <div class="preview-toolbar-actions">
        <el-tooltip :content="buildTooltip" placement="top" :show-after="200">
          <span class="preview-toolbar-tooltip-trigger">
            <button
              type="button"
              class="preview-toolbar-btn preview-toolbar-btn--build"
              :disabled="isBuildDisabled"
              title="构建部署"
              aria-label="构建部署"
              @click="handleBuildClick"
            >
              <span class="preview-toolbar-build-wrap" :class="{ 'preview-toolbar-build-wrap--building': isBuildAnimating }">
                <SvgIcon name="build-wireframe" class="preview-toolbar-build-icon preview-toolbar-build-wireframe" />
                <SvgIcon name="build-face" class="preview-toolbar-build-icon preview-toolbar-build-face" />
              </span>
            </button>
          </span>
        </el-tooltip>
        <el-tooltip :content="canCopyDeployLink ? '复制部署链接' : '暂无部署链接'" placement="top" :show-after="200">
          <span class="preview-toolbar-tooltip-trigger">
            <button
              type="button"
              class="preview-toolbar-btn"
              :class="{ 'preview-toolbar-btn--disabled': !canCopyDeployLink }"
              :disabled="!canCopyDeployLink"
              title="复制部署链接"
              aria-label="复制部署链接"
              @click="handleShare"
            >
              <SvgIcon name="link" class="preview-toolbar-icon" />
            </button>
          </span>
        </el-tooltip>
        <button
          type="button"
          class="preview-toolbar-btn"
          :class="{ 'preview-toolbar-btn--loading': refreshing }"
          :disabled="refreshing"
          title="刷新预览"
          aria-label="刷新预览"
          @click="handleRefresh"
        >
          <SvgIcon name="refresh" class="preview-toolbar-icon" />
        </button>
      </div>
    </header>
    <div class="phone-container">
      <div class="phone-frame">
        <div class="phone-notch" aria-hidden="true" />
        <div class="phone-screen">
          <template v-if="previewUrl">
            <header class="preview-app-header">
              <h3 class="preview-app-title">{{ projectTitle }}</h3>
            </header>
            <iframe :key="iframeKey" class="preview-iframe" :src="previewUrl" title="项目预览" />
          </template>
          <div v-else-if="errorText" class="preview-placeholder preview-placeholder--error">
            {{ errorText }}
          </div>
          <div v-else class="preview-placeholder">
            {{ statusText }}
          </div>
        </div>
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

.preview-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--app-border);
  background-color: var(--app-surface);
}

.preview-toolbar-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
}

.preview-toolbar-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.625rem;
}

.preview-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--app-text-muted);
  font-family: Consolas, 'Courier New', monospace;
  font-size: 0.6rem;
  font-weight: 700;
}

.preview-status i {
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 50%;
  background: currentColor;
}

.preview-status--live {
  color: #4dcc98;
}

.preview-status--error {
  color: #ff806f;
}

.preview-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.preview-toolbar-tooltip-trigger {
  display: inline-flex;
}

.preview-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background-color: var(--app-surface);
  color: var(--app-text-primary);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.preview-toolbar-btn:hover:not(:disabled) {
  background-color: var(--app-bg-subtle);
  border-color: var(--app-border-strong);
  color: var(--app-accent);
}

.preview-toolbar-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.preview-toolbar-btn--disabled:not(:disabled) {
  opacity: 0.45;
}

.preview-toolbar-btn--build {
  overflow: visible;
}

.preview-toolbar-build-wrap {
  position: relative;
  display: inline-flex;
  width: 1.125rem;
  height: 1.125rem;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  --build-icon-wireframe: var(--app-icon-fill);
  --build-icon-face-idle: #ffffff;
  --build-icon-face-dark: #111111;
}

html.dark .preview-toolbar-build-wrap {
  --build-icon-face-dark: var(--app-text-muted);
}

.preview-toolbar-build-wrap--building {
  animation: preview-build-scale 2s ease-in-out infinite;
}

.preview-toolbar-build-wrap--building .preview-toolbar-build-face {
  animation: preview-build-face-color 4s ease-in-out infinite;
}

.preview-toolbar-build-icon {
  position: absolute;
  inset: 0;
  width: 1.125rem;
  height: 1.125rem;
}

.preview-toolbar-build-wireframe {
  fill: var(--build-icon-wireframe);
}

.preview-toolbar-build-face {
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

.preview-toolbar-btn--loading .preview-toolbar-icon {
  animation: preview-spin 2s linear infinite;
}

.preview-toolbar-icon {
  width: 1rem;
  height: 1rem;
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
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.5rem 1rem;
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
  padding: 1rem;
  color: #1a1c1e;
  font-size: 0.85rem;
  text-align: center;
}

.preview-placeholder--error {
  color: var(--app-error);
}
</style>
