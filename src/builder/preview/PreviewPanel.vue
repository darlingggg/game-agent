<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { INDEX_HTML_PATH, parseProjectHtmlConfig } from '../config/projectHtmlConfig'
import { fetchProjectTempFileContent } from '../file/projectTempFiles'
import { refreshProjectTempPreview, previewIframeReloadSignal, resetProjectTempPreview, startProjectTempPreview } from './webcontainer'

defineOptions({
  name: 'PreviewPanel',
})

const projectStore = useProjectStore()

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
  },
  { immediate: true },
)

/** AI 写入文件后防抖重载 iframe，使 Tailwind 样式生效 */
watch(previewIframeReloadSignal, () => {
  if (previewUrl.value) {
    iframeKey.value += 1
  }
})

onUnmounted(() => {
  previewLoadToken++
  resetProjectTempPreview()
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
</script>

<template>
  <div class="preview-panel">
    <header class="preview-toolbar">
      <h2 class="preview-toolbar-title">实时预览</h2>
      <div class="preview-toolbar-actions">
        <button type="button" class="preview-toolbar-btn" :class="{ 'preview-toolbar-btn--loading': refreshing }"
          :disabled="refreshing" title="刷新预览" aria-label="刷新预览" @click="handleRefresh">
          <svg class="preview-toolbar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true">
            <path
              d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 9.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
              fill="currentColor" />
          </svg>
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
  padding: 0.25rem 1rem;
  border-bottom: 1px solid var(--app-border);
  background-color: var(--app-surface);
}

.preview-toolbar-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
}

.preview-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.preview-toolbar-btn--loading .preview-toolbar-icon {
  animation: preview-spin 0.8s linear infinite;
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
  color: var(--app-text-primary);
  font-size: 0.85rem;
  text-align: center;
}

.preview-placeholder--error {
  color: var(--app-error);
}
</style>
