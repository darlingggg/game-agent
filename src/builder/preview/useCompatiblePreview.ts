import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { useTokenUsageStore } from '@/stores/tokenUsage'
import { getRemotePreview, updateRemotePreview, type RemotePreviewState } from '@/http/preview'
import { PREVIEW_CHANGED_EVENT, type PreviewChange } from './previewEvents'
import { RemotePreviewController } from './remotePreviewController'

/** 兼容预览的请求、更新触发和 iframe 生命周期，与本地 WebContainer 分开管理。 */
export function useCompatiblePreview(url: Ref<string>, iframeKey: Ref<number>) {
  const projects = useProjectStore()
  const tokens = useTokenUsageStore()
  const enabled = ref(false)
  const state = ref<RemotePreviewState | null>(null)
  const error = ref('')
  const message = ref('正在准备兼容预览...')
  const frame = ref<HTMLIFrameElement | null>(null)
  const frameLoading = ref(false)
  const frameError = ref('')
  let epoch = 0
  let updateTimer: ReturnType<typeof setTimeout> | undefined
  let frameTimer: ReturnType<typeof setTimeout> | undefined

  const description = computed(() => {
    if (frameError.value) return frameError.value
    if (error.value) return `最新修改尚未预览：${error.value}`
    if (frameLoading.value) return '正在打开预览页面...'
    const task = state.value?.active || state.value?.pending
    if (!task) return state.value?.lastReady ? '预览已更新' : message.value
    const phases: Record<string, string> = {
      queue: `正在排队（位置 ${state.value?.pending?.queuePosition || 1}）`,
      prepare: '正在准备构建', install: '正在安装依赖', build: '正在构建', deploy: '正在上传预览',
    }
    const progress = phases[task.phase] || '正在更新预览'
    return state.value?.pending && state.value.active ? `${progress}，之后更新最新修改` : progress
  })
  const updatedAt = computed(() => {
    const date = state.value?.lastReady?.completedAt
    return date ? new Date(date).toLocaleTimeString() : ''
  })
  const isStale = computed(() => !!state.value?.lastReady
    && state.value.lastReady.revision !== state.value.desiredRevision)
  const busy = computed(() => enabled.value && !error.value
    && !!(state.value?.active || state.value?.pending || frameLoading.value || !state.value?.lastReady))

  const controller = new RemotePreviewController({ get: getRemotePreview, update: updateRemotePreview },
    (value) => {
      state.value = value
      error.value = value.latest?.status === 'failed' ? value.latest.error : ''
      const nextUrl = value.lastReady?.result?.link
      if (nextUrl && url.value !== nextUrl) {
        url.value = nextUrl
        iframeKey.value++
        waitForFrame()
      }
    },
    (failure) => { error.value = failure instanceof Error ? failure.message : '兼容预览请求失败，请重试' },
  )

  function storageKey() {
    const project = projects.currentProject
    return `compatible-preview:${project?.account}:${project?.id}`
  }

  function generating() {
    return tokens.generationStatus === 'streaming' || tokens.generationStatus === 'cancelling'
  }

  function waitForFrame() {
    clearTimeout(frameTimer)
    frameLoading.value = true
    frameError.value = ''
    frameTimer = setTimeout(() => {
      frameLoading.value = false
      frameError.value = '预览页面加载超时，请检查网络后点击刷新预览'
    }, 15_000)
  }

  function handleReady(event: MessageEvent) {
    if (!enabled.value || !url.value || event.source !== frame.value?.contentWindow) return
    if (event.origin !== new URL(url.value).origin) return
    if (event.data?.type !== 'agent-preview-ready' || event.data.revision !== state.value?.lastReady?.revision) return
    clearTimeout(frameTimer)
    frameLoading.value = false
    frameError.value = ''
  }

  function stop() {
    epoch++
    controller.stop()
    clearTimeout(updateTimer)
    clearTimeout(frameTimer)
    enabled.value = false
    state.value = null
    error.value = ''
    frameError.value = ''
    frameLoading.value = false
    message.value = '正在准备兼容预览...'
  }

  async function start() {
    stop()
    const projectId = projects.currentProject?.id
    if (!projectId) return
    const token = epoch
    enabled.value = true
    sessionStorage.setItem(storageKey(), '1')
    await controller.start(projectId)
    if (token !== epoch) return
    if (generating()) {
      message.value = '等待本轮修改完成后生成兼容预览'
      return
    }
    await controller.update()
  }

  function handleChange(event: Event) {
    const { projectId, source } = (event as CustomEvent<PreviewChange>).detail
    if (!enabled.value || projectId !== projects.currentProject?.id || source === 'ai') return
    clearTimeout(updateTimer)
    if (source === 'round') {
      void controller.update()
      return
    }
    updateTimer = setTimeout(() => { if (!generating()) void controller.update() }, 2000)
  }

  async function refresh() {
    error.value = ''
    if (url.value) {
      iframeKey.value++
      waitForFrame()
    }
    await controller.update()
  }

  function retryRealtime() {
    sessionStorage.removeItem(storageKey())
    window.location.reload()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url.value)
      ElMessage.success('预览链接已复制')
    } catch {
      ElMessage.error('复制失败，请使用“打开预览”获取链接')
    }
  }

  onMounted(() => {
    window.addEventListener(PREVIEW_CHANGED_EVENT, handleChange)
    window.addEventListener('message', handleReady)
  })
  onUnmounted(() => {
    stop()
    window.removeEventListener(PREVIEW_CHANGED_EVENT, handleChange)
    window.removeEventListener('message', handleReady)
  })

  return { enabled, error, frameError, description, updatedAt, isStale, busy, frame,
    start, stop, refresh, retryRealtime, copyLink,
    remembered: () => sessionStorage.getItem(storageKey()) === '1' }
}
