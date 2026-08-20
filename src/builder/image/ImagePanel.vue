<script setup lang="ts">
import {
  ArrowRight,
  Close,
  CopyDocument,
  EditPen,
  Link,
  MagicStick,
  Picture,
  Plus,
  RefreshRight,
  Upload,
  WarningFilled,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { uploadImageToCos } from '@/http/cos'
import {
  createImageGeneration,
  getImageGenerationTasks,
  reconnectImageGenerationTask,
  type ImageGenerationSseEvent,
  type ImageGenerationStatus,
  type ImageGenerationTask,
} from '@/http/imageGeneration'
import { getUserInfo } from '@/http/user'
import { useProjectStore } from '@/stores/project'

defineOptions({ name: 'ImagePanel' })

interface ReferenceImage {
  id: string
  url: string
  previewUrl: string
  uploading: boolean
}

type SizeOptionKey = 'auto' | 'square' | 'landscape' | 'portrait' | 'wide' | 'custom'

interface SizeOption {
  key: SizeOptionKey
  label: string
  detail: string
  value?: 'auto' | `${number}*${number}`
  ratio: number
}

const PAGE_SIZE = 12
const MAX_REFERENCE_IMAGES = 3
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024
const MIN_IMAGE_EDGE = 512
const MAX_IMAGE_EDGE = 2048
const IMAGE_SIZE_STEP = 64
const ALLOWED_REFERENCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const TERMINAL_STATUSES = new Set<ImageGenerationStatus>(['succeeded', 'failed'])
const SIZE_OPTIONS: SizeOption[] = [
  { key: 'auto', label: '智能', detail: 'AUTO', value: 'auto', ratio: 1 },
  { key: 'square', label: '方形', detail: '1024 × 1024', value: '1024*1024', ratio: 1 },
  { key: 'landscape', label: '横向', detail: '1536 × 1024', value: '1536*1024', ratio: 1.5 },
  { key: 'portrait', label: '竖向', detail: '1024 × 1536', value: '1024*1536', ratio: 2 / 3 },
  { key: 'wide', label: '宽屏', detail: '1792 × 1024', value: '1792*1024', ratio: 1.75 },
  { key: 'custom', label: '自定义', detail: '512–2048', ratio: 1 },
]

const projectStore = useProjectStore()
const prompt = ref('')
const negativePrompt = ref('')
const referenceUrl = ref('')
const references = ref<ReferenceImage[]>([])
const userAccount = ref('')
const creating = ref(false)
const selectedSizeKey = ref<SizeOptionKey>('auto')
const customWidth = ref(1024)
const customHeight = ref(1024)
const fileInputRef = ref<HTMLInputElement | null>(null)
const scrollRootRef = ref<HTMLElement | null>(null)
const loadSentinelRef = ref<HTMLElement | null>(null)

const tasks = ref<ImageGenerationTask[]>([])
const historyLoading = ref(false)
const loadingMore = ref(false)
const historyError = ref('')
const currentPage = ref(0)
const hasMore = ref(true)

const activeConnections = new Map<number, AbortController>()
const reconnectTimers = new Map<number, number>()
const notifiedErrors = new Set<number>()
let observer: IntersectionObserver | null = null
let referenceIdSeed = 0

const projectId = computed(() => projectStore.currentProject?.id ?? 0)
const hasUploadingReference = computed(() => references.value.some((item) => item.uploading))
const selectedSize = computed<'auto' | `${number}*${number}`>(() => {
  if (selectedSizeKey.value === 'custom') return `${customWidth.value}*${customHeight.value}`
  return SIZE_OPTIONS.find((item) => item.key === selectedSizeKey.value)?.value ?? 'auto'
})
const sizeValidationError = computed(() => {
  if (selectedSizeKey.value !== 'custom') return ''
  const dimensions = [customWidth.value, customHeight.value]
  if (dimensions.some((value) => !Number.isInteger(value))) return '请输入整数尺寸'
  if (dimensions.some((value) => value < MIN_IMAGE_EDGE || value > MAX_IMAGE_EDGE)) {
    return `宽高范围为 ${MIN_IMAGE_EDGE}–${MAX_IMAGE_EDGE}px`
  }
  return ''
})
const sizePreviewRatio = computed(() => {
  if (selectedSizeKey.value === 'custom') return customWidth.value / customHeight.value
  return SIZE_OPTIONS.find((item) => item.key === selectedSizeKey.value)?.ratio ?? 1
})
const sizePreviewStyle = computed(() => {
  const ratio = Math.min(Math.max(sizePreviewRatio.value || 1, 0.125), 8)
  if (ratio >= 1) return { width: '70px', height: `${70 / ratio}px` }
  return { width: `${50 * ratio}px`, height: '50px' }
})
const canGenerate = computed(
  () => Boolean(projectId.value && prompt.value.trim())
    && !creating.value
    && !hasUploadingReference.value
    && !sizeValidationError.value,
)

const statusLabels: Record<ImageGenerationStatus, string> = {
  queued: '等待提交',
  submitted: '已提交',
  generating: '生成中',
  storing: '正在保存',
  succeeded: '已完成',
  failed: '生成失败',
}

function createReferenceId() {
  referenceIdSeed += 1
  return `image-reference-${referenceIdSeed}`
}

function isTerminal(status: ImageGenerationStatus) {
  return TERMINAL_STATUSES.has(status)
}

function displayUrl(task: ImageGenerationTask) {
  return task.url || task.temporaryUrl || ''
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatTaskSize(task: ImageGenerationTask) {
  if (task.width && task.height) return `${task.width} × ${task.height}`
  if (!task.imageSize || task.imageSize === 'auto') return '智能画幅'
  return task.imageSize.replace('*', ' × ')
}

function taskNumber(taskId: number) {
  return `#${String(taskId).padStart(4, '0')}`
}

function selectSize(option: SizeOption) {
  selectedSizeKey.value = option.key
}

function normalizeDimension(target: 'width' | 'height') {
  const current = target === 'width' ? customWidth.value : customHeight.value
  const normalized = Math.min(
    MAX_IMAGE_EDGE,
    Math.max(MIN_IMAGE_EDGE, Math.round((Number(current) || MIN_IMAGE_EDGE) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP),
  )
  if (target === 'width') customWidth.value = normalized
  else customHeight.value = normalized
}

function applyTaskSize(size: string) {
  const matched = SIZE_OPTIONS.find((item) => item.value === size)
  if (matched) {
    selectedSizeKey.value = matched.key
    return
  }
  const match = size.match(/^(\d+)\*(\d+)$/)
  if (!match) {
    selectedSizeKey.value = 'auto'
    return
  }
  selectedSizeKey.value = 'custom'
  customWidth.value = Number(match[1])
  customHeight.value = Number(match[2])
}

function mergeTask(patch: Partial<ImageGenerationTask> & { taskId: number }) {
  const index = tasks.value.findIndex((item) => item.taskId === patch.taskId)
  if (index < 0) {
    tasks.value.unshift(patch as ImageGenerationTask)
    return
  }
  tasks.value[index] = { ...tasks.value[index], ...patch } as ImageGenerationTask
}

function handleTaskEvent(taskId: number, event: ImageGenerationSseEvent) {
  const data = event.data ?? {}
  const eventTaskId = Number(data.taskId || taskId)

  if (event.event === 'status') {
    mergeTask({ ...data, taskId: eventTaskId } as Partial<ImageGenerationTask> & { taskId: number })
    return
  }
  if (event.event === 'generated') {
    mergeTask({ taskId: eventTaskId, temporaryUrl: data.temporaryUrl || null, status: 'storing' })
    return
  }
  if (event.event === 'stored') {
    mergeTask({ ...data, taskId: eventTaskId, status: 'succeeded' } as Partial<ImageGenerationTask> & { taskId: number })
    return
  }
  if (event.event === 'done') {
    mergeTask({ taskId: eventTaskId, status: 'succeeded' })
    return
  }
  if (event.event === 'error') {
    const message = data.message || '图片生成失败'
    mergeTask({ taskId: eventTaskId, status: 'failed', errorMessage: message })
    if (!notifiedErrors.has(eventTaskId)) {
      notifiedErrors.add(eventTaskId)
      ElMessage.error(message)
    }
  }
}

function scheduleReconnect(taskId: number) {
  if (reconnectTimers.has(taskId)) return
  const timer = window.setTimeout(() => {
    reconnectTimers.delete(taskId)
    connectTask(taskId)
  }, 3000)
  reconnectTimers.set(taskId, timer)
}

function connectTask(taskId: number) {
  if (activeConnections.has(taskId)) return
  const task = tasks.value.find((item) => item.taskId === taskId)
  if (!task || isTerminal(task.status)) return

  const controller = new AbortController()
  activeConnections.set(taskId, controller)
  void reconnectImageGenerationTask({
    taskId,
    signal: controller.signal,
    onEvent: (event) => handleTaskEvent(taskId, event),
  })
    .catch((error) => {
      if (controller.signal.aborted) return
      console.warn('[ImagePanel] 生图任务连接中断:', error)
    })
    .finally(() => {
      activeConnections.delete(taskId)
      const latest = tasks.value.find((item) => item.taskId === taskId)
      if (latest && !isTerminal(latest.status) && !controller.signal.aborted) {
        scheduleReconnect(taskId)
      }
    })
}

function connectPendingTasks(list: ImageGenerationTask[]) {
  list.filter((task) => !isTerminal(task.status)).forEach((task) => connectTask(task.taskId))
}

async function loadHistory(reset = false) {
  if (!projectId.value || historyLoading.value || loadingMore.value) return
  if (!reset && !hasMore.value) return

  const nextPage = reset ? 1 : currentPage.value + 1
  if (reset) historyLoading.value = true
  else loadingMore.value = true
  historyError.value = ''

  try {
    const result = await getImageGenerationTasks({
      projectId: projectId.value,
      page: nextPage,
      pageSize: PAGE_SIZE,
    })
    if (reset) {
      tasks.value = result.list
    } else {
      const knownIds = new Set(tasks.value.map((item) => item.taskId))
      tasks.value.push(...result.list.filter((item) => !knownIds.has(item.taskId)))
    }
    currentPage.value = result.pagination.page
    hasMore.value = result.pagination.hasMore
    connectPendingTasks(result.list)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '生成记录加载失败'
  } finally {
    historyLoading.value = false
    loadingMore.value = false
  }
}

async function handleGenerate() {
  if (!canGenerate.value) return
  creating.value = true
  try {
    const task = await createImageGeneration({
      projectId: projectId.value,
      prompt: prompt.value.trim(),
      negativePrompt: negativePrompt.value.trim() || undefined,
      imageUrls: references.value.map((item) => item.url).filter(Boolean),
      size: selectedSize.value,
    })
    tasks.value = [task, ...tasks.value.filter((item) => item.taskId !== task.taskId)]
    connectTask(task.taskId)
    ElMessage.success('图片生成任务已开始')
  } catch {
    // axios 拦截器统一提示
  } finally {
    creating.value = false
  }
}

function openReferencePicker() {
  if (references.value.length >= MAX_REFERENCE_IMAGES) {
    ElMessage.warning(`最多添加 ${MAX_REFERENCE_IMAGES} 张关联图`)
    return
  }
  fileInputRef.value?.click()
}

async function uploadReference(file: File) {
  const id = createReferenceId()
  const blobUrl = URL.createObjectURL(file)
  references.value.push({ id, url: '', previewUrl: blobUrl, uploading: true })
  try {
    const result = await uploadImageToCos(file, userAccount.value)
    const target = references.value.find((item) => item.id === id)
    if (!target) return
    target.url = result.url
    target.previewUrl = result.url
    target.uploading = false
    URL.revokeObjectURL(blobUrl)
  } catch (error) {
    references.value = references.value.filter((item) => item.id !== id)
    URL.revokeObjectURL(blobUrl)
    ElMessage.error(error instanceof Error ? error.message : '关联图上传失败')
  }
}

function handleReferenceFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const slots = MAX_REFERENCE_IMAGES - references.value.length

  for (const file of files.slice(0, slots)) {
    if (!ALLOWED_REFERENCE_TYPES.has(file.type)) {
      ElMessage.warning(`${file.name}：仅支持 JPG、PNG、WebP`)
      continue
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      ElMessage.warning(`${file.name}：文件不能超过 10MB`)
      continue
    }
    void uploadReference(file)
  }
}

function addReferenceUrl() {
  const value = referenceUrl.value.trim()
  if (!value) return
  if (references.value.length >= MAX_REFERENCE_IMAGES) {
    ElMessage.warning(`最多添加 ${MAX_REFERENCE_IMAGES} 张关联图`)
    return
  }
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
  } catch {
    ElMessage.warning('请输入有效的 HTTP(S) 图片地址')
    return
  }
  if (references.value.some((item) => item.url === value)) {
    ElMessage.warning('这张图片已经添加')
    return
  }
  references.value.push({ id: createReferenceId(), url: value, previewUrl: value, uploading: false })
  referenceUrl.value = ''
}

function addHistoryReference(task: ImageGenerationTask) {
  const url = displayUrl(task)
  if (!url) return
  if (references.value.length >= MAX_REFERENCE_IMAGES) {
    ElMessage.warning(`最多添加 ${MAX_REFERENCE_IMAGES} 张关联图`)
    return
  }
  if (references.value.some((item) => item.url === url)) {
    ElMessage.warning('这张图片已经添加')
    return
  }
  references.value.push({ id: createReferenceId(), url, previewUrl: url, uploading: false })
  ElMessage.success('已加入关联图')
}

function reuseTask(task: ImageGenerationTask) {
  prompt.value = task.prompt
  negativePrompt.value = task.negativePrompt || ''
  applyTaskSize(task.imageSize || 'auto')
  scrollRootRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  ElMessage.success('生成设置已带回创作台')
}

function removeReference(index: number) {
  const [removed] = references.value.splice(index, 1)
  if (removed?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl)
}

async function copyPrompt(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('提示词已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选择提示词')
  }
}

function setupInfiniteScroll() {
  observer?.disconnect()
  if (!scrollRootRef.value || !loadSentinelRef.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadHistory()
    },
    { root: scrollRootRef.value, rootMargin: '180px 0px', threshold: 0.01 },
  )
  observer.observe(loadSentinelRef.value)
}

function stopTaskConnections() {
  activeConnections.forEach((controller) => controller.abort())
  activeConnections.clear()
  reconnectTimers.forEach((timer) => clearTimeout(timer))
  reconnectTimers.clear()
}

watch(projectId, (next, previous) => {
  if (!next || next === previous) return
  stopTaskConnections()
  currentPage.value = 0
  hasMore.value = true
  tasks.value = []
  void loadHistory(true)
})

onMounted(async () => {
  await nextTick()
  setupInfiniteScroll()
  void loadHistory(true)
  try {
    userAccount.value = (await getUserInfo()).account
  } catch {
    // 请求层统一处理登录状态
  }
})

onUnmounted(() => {
  observer?.disconnect()
  stopTaskConnections()
  references.value.forEach((item) => {
    if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
  })
})
</script>

<template>
  <div class="image-lab-panel">
    <div ref="scrollRootRef" class="image-lab-scroll">
      <header class="image-lab-masthead">
        <div class="image-masthead-inner">
          <div class="image-masthead-copy">
            <span class="image-lab-kicker"><i /> IMAGE LAB</span>
            <h1>图像工作台</h1>
            <div class="image-masthead-meta">
              <span>QWEN IMAGE 3.0</span>
              <span>{{ selectedSize === 'auto' ? '智能画幅' : selectedSize.replace('*', ' × ') }}</span>
              <span>高质量 WEBP</span>
            </div>
          </div>
          <div class="image-frame-readout" aria-label="当前画幅预览">
            <div class="image-frame-stage">
              <span class="image-frame-shape" :style="sizePreviewStyle" />
            </div>
            <div>
              <small>OUTPUT FRAME</small>
              <strong>{{ selectedSize === 'auto' ? 'AUTO' : selectedSize.replace('*', ' × ') }}</strong>
            </div>
          </div>
          <div class="image-palette-rail" aria-hidden="true">
            <i /><i /><i /><i />
          </div>
        </div>
      </header>

      <main>
        <section class="image-compose" aria-labelledby="image-compose-title">
          <div class="image-section-heading">
            <div class="image-section-index">01</div>
            <div>
              <span>CREATE</span>
              <h2 id="image-compose-title">创建新画面</h2>
            </div>
          </div>

          <div class="image-compose-board">
            <div class="image-prompt-column">
              <label class="image-field image-field--primary">
                <span class="image-field-label">
                  <span>画面描述</span>
                  <b>{{ prompt.length }} / 800</b>
                </span>
                <textarea
                  v-model="prompt"
                  maxlength="800"
                  rows="8"
                  placeholder="描述你想生成的主体、场景、构图、光线与风格……"
                />
              </label>
              <label class="image-field image-field--negative">
                <span class="image-field-label">
                  <span>排除内容 <em>可选</em></span>
                  <b>{{ negativePrompt.length }} / 500</b>
                </span>
                <textarea
                  v-model="negativePrompt"
                  maxlength="500"
                  rows="3"
                  placeholder="描述不希望出现的内容，例如：低清晰度、畸形手部、水印、乱码"
                />
              </label>
            </div>

            <aside class="image-settings-column" aria-label="生成设置">
              <section class="image-setting-group image-setting-group--reference">
                <div class="image-setting-heading">
                  <div>
                    <span>REFERENCE</span>
                    <strong>关联图片</strong>
                  </div>
                  <b>{{ references.length }} / {{ MAX_REFERENCE_IMAGES }}</b>
                </div>

                <div class="image-reference-strip">
                  <div v-for="(item, index) in references" :key="item.id" class="image-reference-item">
                    <img :src="item.previewUrl" alt="关联图预览" referrerpolicy="no-referrer" />
                    <span v-if="item.uploading" class="image-reference-loading" aria-label="上传中" />
                    <button type="button" title="移除关联图" aria-label="移除关联图" @click="removeReference(index)">
                      <el-icon><Close /></el-icon>
                    </button>
                  </div>
                  <button
                    v-if="references.length < MAX_REFERENCE_IMAGES"
                    type="button"
                    class="image-reference-add"
                    title="上传关联图"
                    @click="openReferencePicker"
                  >
                    <el-icon><Upload /></el-icon>
                    <span>上传</span>
                  </button>
                </div>

                <div class="image-reference-url">
                  <el-icon><Link /></el-icon>
                  <input
                    v-model="referenceUrl"
                    type="url"
                    placeholder="粘贴图片地址"
                    :disabled="references.length >= MAX_REFERENCE_IMAGES"
                    @keydown.enter.prevent="addReferenceUrl"
                  />
                  <button
                    type="button"
                    title="添加图片地址"
                    aria-label="添加图片地址"
                    :disabled="!referenceUrl.trim()"
                    @click="addReferenceUrl"
                  >
                    <el-icon><ArrowRight /></el-icon>
                  </button>
                </div>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  @change="handleReferenceFiles"
                />
              </section>

              <section class="image-setting-group image-setting-group--size">
                <div class="image-setting-heading">
                  <div>
                    <span>FRAME</span>
                    <strong>输出尺寸</strong>
                  </div>
                  <b>512–2048 PX</b>
                </div>

                <div class="image-size-options" role="group" aria-label="选择输出尺寸">
                  <button
                    v-for="option in SIZE_OPTIONS"
                    :key="option.key"
                    type="button"
                    class="image-size-option"
                    :class="{ 'is-active': selectedSizeKey === option.key }"
                    :aria-pressed="selectedSizeKey === option.key"
                    @click="selectSize(option)"
                  >
                    <span class="image-size-icon"><i :style="{ aspectRatio: String(option.ratio) }" /></span>
                    <strong>{{ option.label }}</strong>
                    <small>{{ option.detail }}</small>
                  </button>
                </div>

                <div v-if="selectedSizeKey === 'custom'" class="image-custom-size">
                  <label>
                    <span>宽度</span>
                    <input
                      v-model.number="customWidth"
                      type="number"
                      :min="MIN_IMAGE_EDGE"
                      :max="MAX_IMAGE_EDGE"
                      :step="IMAGE_SIZE_STEP"
                      @blur="normalizeDimension('width')"
                    />
                  </label>
                  <b>×</b>
                  <label>
                    <span>高度</span>
                    <input
                      v-model.number="customHeight"
                      type="number"
                      :min="MIN_IMAGE_EDGE"
                      :max="MAX_IMAGE_EDGE"
                      :step="IMAGE_SIZE_STEP"
                      @blur="normalizeDimension('height')"
                    />
                  </label>
                </div>
                <span v-if="sizeValidationError" class="image-size-error">{{ sizeValidationError }}</span>
              </section>

              <div class="image-generate-row">
                <span>{{ references.length ? '图生图' : '文生图' }} · 1 张</span>
                <button type="button" class="image-generate-button" :disabled="!canGenerate" @click="handleGenerate">
                  <span v-if="creating" class="image-button-spinner" />
                  <el-icon v-else><MagicStick /></el-icon>
                  <span>{{ creating ? '正在创建' : '开始生成' }}</span>
                  <el-icon v-if="!creating"><ArrowRight /></el-icon>
                </button>
              </div>
            </aside>
          </div>
        </section>

        <section class="image-history" aria-labelledby="image-history-title">
          <div class="image-history-inner">
            <div class="image-history-heading">
              <div class="image-section-index">02</div>
              <div class="image-history-title">
                <span>CONTACT SHEET</span>
                <h2 id="image-history-title">生成记录</h2>
              </div>
              <span v-if="tasks.length" class="image-history-count">{{ tasks.length }} 个画面</span>
              <button
                type="button"
                title="刷新生成记录"
                aria-label="刷新生成记录"
                :disabled="historyLoading"
                @click="loadHistory(true)"
              >
                <el-icon :class="{ 'is-spinning': historyLoading }"><RefreshRight /></el-icon>
              </button>
            </div>

            <div v-if="historyLoading && tasks.length === 0" class="image-history-grid" aria-label="正在加载生成记录">
              <div v-for="index in 6" :key="index" class="image-task-skeleton" />
            </div>

            <div v-else-if="historyError && tasks.length === 0" class="image-history-empty image-history-empty--error">
              <el-icon><WarningFilled /></el-icon>
              <strong>生成记录加载失败</strong>
              <button type="button" @click="loadHistory(true)">重新加载</button>
            </div>

            <div v-else-if="tasks.length === 0" class="image-history-empty">
              <el-icon><Picture /></el-icon>
              <strong>第一张画面会出现在这里</strong>
              <span>填写画面描述并开始生成</span>
            </div>

            <div v-else class="image-history-grid">
              <article v-for="task in tasks" :key="task.taskId" class="image-task" :class="`image-task--${task.status}`">
                <div class="image-task-media">
                  <el-image
                    v-if="displayUrl(task)"
                    :src="displayUrl(task)"
                    :preview-src-list="[displayUrl(task)]"
                    :alt="task.prompt"
                    fit="cover"
                    preview-teleported
                    hide-on-click-modal
                  >
                    <template #error>
                      <div class="image-task-fallback"><el-icon><Picture /></el-icon><span>图片加载失败</span></div>
                    </template>
                  </el-image>

                  <div v-else-if="task.status === 'failed'" class="image-task-failure">
                    <el-icon><WarningFilled /></el-icon>
                    <span>NO OUTPUT</span>
                    <strong>没有生成画面</strong>
                    <p :title="task.errorMessage || ''">{{ task.errorMessage || '生成任务失败' }}</p>
                    <button type="button" aria-label="带回创作台" @click="reuseTask(task)">
                      <el-icon><EditPen /></el-icon>
                      带回创作台
                    </button>
                  </div>

                  <div v-else class="image-task-waiting">
                    <span class="image-task-aperture"><i /><i /><i /></span>
                    <small>RENDERING</small>
                    <strong>{{ statusLabels[task.status] }}</strong>
                  </div>

                  <div v-if="displayUrl(task)" class="image-task-overlay">
                    <p>{{ task.prompt }}</p>
                    <div class="image-task-actions">
                      <button type="button" title="复制提示词" aria-label="复制提示词" @click.stop="copyPrompt(task.prompt)">
                        <el-icon><CopyDocument /></el-icon>
                      </button>
                      <button type="button" title="复用生成设置" aria-label="复用生成设置" @click.stop="reuseTask(task)">
                        <el-icon><EditPen /></el-icon>
                      </button>
                      <button
                        type="button"
                        title="用作关联图"
                        aria-label="用作关联图"
                        :disabled="references.length >= MAX_REFERENCE_IMAGES"
                        @click.stop="addHistoryReference(task)"
                      >
                        <el-icon><Plus /></el-icon>
                      </button>
                    </div>
                  </div>

                  <span v-if="displayUrl(task)" class="image-task-status">{{ statusLabels[task.status] }}</span>
                  <div v-if="!isTerminal(task.status) && displayUrl(task)" class="image-task-processing" aria-hidden="true" />
                </div>

                <footer class="image-task-caption">
                  <div>
                    <span>{{ taskNumber(task.taskId) }}</span>
                    <b>{{ formatTaskSize(task) }}</b>
                  </div>
                  <p :title="task.prompt">{{ task.prompt }}</p>
                  <div class="image-task-meta">
                    <span>{{ formatTime(task.createdAt) }}</span>
                    <span v-if="task.storedSize">{{ formatBytes(task.storedSize) }}</span>
                    <span :class="`is-${task.status}`">{{ statusLabels[task.status] }}</span>
                  </div>
                </footer>
              </article>
            </div>

            <div ref="loadSentinelRef" class="image-history-sentinel" aria-live="polite">
              <span v-if="loadingMore" class="image-button-spinner" />
              <span v-if="loadingMore">正在加载</span>
              <button v-else-if="historyError && tasks.length" type="button" @click="loadHistory()">加载失败，点击重试</button>
              <span v-else-if="tasks.length && !hasMore">已加载全部记录</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.image-lab-panel {
  --image-line: var(--app-border);
  --image-surface: var(--app-surface);
  --image-subtle: var(--app-bg-subtle);
  --image-ink: var(--app-text-primary);
  --image-muted: var(--app-text-secondary);
  --image-blue: var(--brand-blue);
  --image-blue-soft: var(--brand-blue-soft);
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--image-surface);
  color: var(--image-ink);
  font-family: var(--brand-font-body);
}

.image-lab-scroll {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.image-lab-header,
.image-compose,
.image-history {
  width: min(100%, 1040px);
  margin-inline: auto;
  padding-inline: clamp(16px, 3vw, 32px);
}

.image-lab-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-block: 24px 18px;
}

.image-lab-kicker,
.image-section-heading span,
.image-history-heading span {
  color: var(--image-blue);
  font-family: var(--brand-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0;
}

.image-lab-header h1 {
  margin: 4px 0 0;
  font-family: var(--brand-font-display);
  font-size: 24px;
  line-height: 1.05;
}

.image-lab-model {
  display: flex;
  align-items: center;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-sm);
  color: var(--image-muted);
  font-family: var(--brand-font-mono);
  font-size: 9px;
  white-space: nowrap;
}

.image-lab-model span,
.image-lab-model b {
  padding: 7px 9px;
}

.image-lab-model b {
  border-left: 1px solid var(--image-line);
  color: var(--image-blue);
}

.image-compose {
  padding-block: 20px 22px;
  border-block: 1px solid var(--image-line);
}

.image-section-heading,
.image-history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.image-section-heading h2,
.image-history-heading h2 {
  margin: 2px 0 0;
  font-size: 15px;
  line-height: 1.2;
}

.image-compose-count {
  color: var(--image-muted) !important;
}

.image-reference-row {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.image-reference-strip {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.image-reference-item,
.image-reference-add {
  position: relative;
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
  overflow: hidden;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-sm);
  background: var(--image-subtle);
}

.image-reference-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-reference-item > button {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  background: rgba(15, 17, 21, 0.76);
  color: #fff;
  cursor: pointer;
}

.image-reference-loading,
.image-button-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, var(--image-blue) 25%, transparent);
  border-top-color: var(--image-blue);
  border-radius: 50%;
  animation: image-spin 0.8s linear infinite;
}

.image-reference-loading {
  position: absolute;
  inset: 0;
  margin: auto;
  border-color: rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
}

.image-reference-add {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 3px;
  color: var(--image-muted);
  cursor: pointer;
  font-size: 10px;
}

.image-reference-add:hover {
  border-color: var(--image-blue);
  color: var(--image-blue);
}

.image-reference-url {
  display: grid;
  min-width: 0;
  height: 38px;
  align-self: center;
  grid-template-columns: 30px minmax(0, 1fr) 34px;
  align-items: center;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-sm);
  background: var(--image-surface);
  color: var(--image-muted);
}

.image-reference-url > .el-icon {
  justify-self: center;
}

.image-reference-url input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--image-ink);
  font: inherit;
  font-size: 12px;
}

.image-reference-url button,
.image-history-heading > button,
.image-task-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--image-muted);
  cursor: pointer;
}

.image-reference-url button {
  width: 34px;
  height: 36px;
  border-left: 1px solid var(--image-line);
}

.image-reference-url button:hover:not(:disabled),
.image-history-heading > button:hover:not(:disabled),
.image-task-actions button:hover:not(:disabled) {
  color: var(--image-blue);
}

.image-reference-url button:disabled,
.image-task-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.image-prompt-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(180px, 0.8fr);
  gap: 12px;
}

.image-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.image-field-label {
  display: flex;
  justify-content: space-between;
  color: var(--image-ink);
  font-size: 12px;
  font-weight: 700;
}

.image-field-label b {
  color: var(--image-muted);
  font-family: var(--brand-font-mono);
  font-size: 9px;
}

.image-field textarea {
  width: 100%;
  min-height: 112px;
  resize: vertical;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-sm);
  outline: 0;
  background: var(--image-subtle);
  color: var(--image-ink);
  padding: 10px 11px;
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
}

.image-field textarea:hover,
.image-field textarea:focus {
  border-color: color-mix(in srgb, var(--image-blue) 65%, var(--image-line));
  background: var(--image-surface);
}

.image-field textarea::placeholder,
.image-reference-url input::placeholder {
  color: var(--app-text-muted);
}

.image-compose-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
}

.image-compose-footer > span {
  color: var(--image-muted);
  font-size: 10px;
}

.image-generate-button {
  display: inline-flex;
  min-width: 124px;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--brand-ink);
  border-radius: var(--brand-radius-sm);
  background: var(--image-blue);
  box-shadow: 3px 3px 0 var(--brand-ink);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.image-generate-button:hover:not(:disabled) {
  background: var(--brand-blue-strong);
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 var(--brand-ink);
}

.image-generate-button:disabled {
  cursor: not-allowed;
  filter: grayscale(0.25);
  opacity: 0.5;
}

.image-generate-button .image-button-spinner {
  border-color: rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
}

.image-history {
  padding-block: 22px 36px;
}

.image-history-heading > button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-sm);
  background: var(--image-subtle);
}

.image-history-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
  gap: 12px;
}

.image-task,
.image-task-skeleton {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-md);
  background: var(--image-surface);
}

.image-task-media {
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-bottom: 1px solid var(--image-line);
  background-color: var(--image-subtle);
  background-image: linear-gradient(var(--brand-grid) 1px, transparent 1px), linear-gradient(90deg, var(--brand-grid) 1px, transparent 1px);
  background-size: 18px 18px;
}

.image-task-media :deep(.el-image),
.image-task-media :deep(.el-image__inner),
.image-task-fallback {
  width: 100%;
  height: 100%;
}

.image-task-fallback {
  display: grid;
  place-items: center;
  color: var(--app-text-muted);
  font-size: 30px;
}

.image-task-processing {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--image-blue-soft) 38%, transparent);
}

.image-task-processing::after {
  position: absolute;
  top: -22%;
  left: 0;
  width: 100%;
  height: 22%;
  background: linear-gradient(transparent, color-mix(in srgb, var(--image-blue) 28%, transparent), transparent);
  content: '';
  animation: image-scan 2.1s ease-in-out infinite;
}

.image-task-status {
  position: absolute;
  top: 8px;
  left: 8px;
  min-height: 22px;
  padding: 4px 7px;
  border: 1px solid color-mix(in srgb, var(--image-line) 70%, transparent);
  border-radius: var(--brand-radius-xs);
  background: color-mix(in srgb, var(--image-surface) 88%, transparent);
  color: var(--image-ink);
  font-size: 9px;
  font-weight: 700;
  backdrop-filter: blur(8px);
}

.image-task--succeeded .image-task-status {
  color: var(--brand-success);
}

.image-task--failed .image-task-status {
  color: var(--brand-coral);
}

.image-task-body {
  padding: 10px;
}

.image-task-body > p {
  display: -webkit-box;
  min-height: 36px;
  overflow: hidden;
  color: var(--image-ink);
  font-size: 12px;
  line-height: 18px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.image-task-meta {
  display: flex;
  min-height: 20px;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  color: var(--image-muted);
  font-family: var(--brand-font-mono);
  font-size: 8px;
  white-space: nowrap;
}

.image-task-error {
  display: block;
  overflow: hidden;
  color: var(--brand-coral);
  font-size: 10px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-task-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding-top: 7px;
  border-top: 1px solid var(--image-line);
}

.image-task-actions button {
  min-width: 28px;
  height: 28px;
  gap: 4px;
  border-radius: var(--brand-radius-xs);
  font-size: 10px;
}

.image-task-actions button:hover:not(:disabled) {
  background: var(--image-blue-soft);
}

.image-task-skeleton {
  aspect-ratio: 0.76;
  background: linear-gradient(90deg, var(--image-subtle) 20%, color-mix(in srgb, var(--image-line) 45%, var(--image-surface)) 50%, var(--image-subtle) 80%);
  background-size: 220% 100%;
  animation: image-shimmer 1.4s linear infinite;
}

.image-history-empty {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  border-block: 1px solid var(--image-line);
  color: var(--image-muted);
  text-align: center;
}

.image-history-empty > .el-icon {
  color: var(--image-blue);
  font-size: 28px;
}

.image-history-empty strong {
  color: var(--image-ink);
  font-size: 13px;
}

.image-history-empty span,
.image-history-empty button {
  font-size: 11px;
}

.image-history-empty button,
.image-history-sentinel button {
  border: 0;
  background: transparent;
  color: var(--image-blue);
  cursor: pointer;
}

.image-history-sentinel {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--image-muted);
  font-size: 10px;
}

.is-spinning {
  animation: image-spin 0.8s linear infinite;
}

@keyframes image-spin {
  to { transform: rotate(360deg); }
}

@keyframes image-scan {
  0% { transform: translateY(0); }
  100% { transform: translateY(560%); }
}

@keyframes image-shimmer {
  to { background-position: -220% 0; }
}

@media (max-width: 720px) {
  .image-lab-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .image-reference-row,
  .image-prompt-grid {
    grid-template-columns: 1fr;
  }

  .image-reference-url {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .image-lab-header,
  .image-compose,
  .image-history {
    padding-inline: 14px;
  }

  .image-lab-model span {
    display: none;
  }

  .image-lab-model b {
    border-left: 0;
  }

  .image-history-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .image-task-body {
    padding: 8px;
  }

  .image-task-meta span:nth-child(n + 2) {
    display: none;
  }

  .image-compose-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .image-generate-button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .image-task-processing::after,
  .image-task-skeleton,
  .is-spinning,
  .image-button-spinner,
  .image-reference-loading {
    animation: none;
  }
}

/* Image Lab v2: a focused creation desk above an image-first contact sheet. */
.image-lab-panel {
  --image-canvas: #f4f6f8;
  --image-paper: #ffffff;
  --image-paper-muted: #f7f8fa;
  --image-ink: #15171c;
  --image-muted: #6f7784;
  --image-line: rgba(21, 23, 28, 0.14);
  --image-line-strong: rgba(21, 23, 28, 0.28);
  --image-stage: #15171c;
  --image-blue: #315efb;
  --image-blue-soft: #e9efff;
  --image-coral: #ff5b45;
  --image-mint: #66d7a8;
  --image-yellow: #f2c94c;
  background: var(--image-canvas);
}

html.dark .image-lab-panel {
  --image-canvas: #111419;
  --image-paper: #191d24;
  --image-paper-muted: #151920;
  --image-ink: #edf0f5;
  --image-muted: #8f98a6;
  --image-line: rgba(237, 240, 245, 0.14);
  --image-line-strong: rgba(237, 240, 245, 0.27);
  --image-stage: #0b0e13;
  --image-blue: #6f98ff;
  --image-blue-soft: #1d2948;
  --image-coral: #ff806f;
  --image-mint: #4dcc98;
  --image-yellow: #f3c959;
}

.image-lab-masthead {
  position: relative;
  overflow: hidden;
  border-bottom: 0;
  background: var(--image-stage);
  color: #f7f8fa;
}

.image-lab-masthead::after {
  position: absolute;
  top: 0;
  right: max(24px, calc((100% - 1180px) / 2));
  width: 1px;
  height: 100%;
  background: rgba(255, 255, 255, 0.13);
  content: '';
}

.image-masthead-inner,
.image-compose,
.image-history-inner {
  width: min(100%, 1180px);
  margin-inline: auto;
  padding-inline: clamp(18px, 3vw, 36px);
}

.image-masthead-inner {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 142px;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding-block: 26px;
}

.image-palette-rail {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 4px;
  isolation: isolate;
  background: linear-gradient(90deg, #4285f4 0%, #7765e8 10%, #ea4335 20%, #fbbc05 32%, #34a853 42%, #4285f4 50%, #7765e8 60%, #ea4335 70%, #fbbc05 82%, #34a853 92%, #4285f4 100%);
  background-size: 200% 100%;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.42);
  animation: image-neon-flow 5.5s linear infinite;
}

.image-palette-rail::before {
  position: absolute;
  z-index: -1;
  inset: -2px 0 0;
  background: inherit;
  content: '';
  filter: blur(10px) saturate(1.3);
  opacity: 0.75;
  animation: image-neon-pulse 2.8s ease-in-out infinite alternate;
}

.image-palette-rail::after {
  position: absolute;
  inset: 0 0 auto;
  height: 1px;
  background: rgba(255, 255, 255, 0.9);
  content: '';
}

.image-palette-rail i {
  display: none;
}

.image-lab-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #aeb6c4;
  font-family: var(--brand-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.image-lab-kicker i {
  width: 7px;
  height: 7px;
  background: var(--image-mint);
  box-shadow: 0 0 0 3px rgba(102, 215, 168, 0.16);
}

.image-masthead-copy h1 {
  margin: 9px 0 12px;
  color: #fff;
  font-family: var(--brand-font-display);
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
}

.image-masthead-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  color: #929baa;
  font-family: var(--brand-font-mono);
  font-size: 11px;
}

.image-masthead-meta span {
  padding-right: 10px;
}

.image-masthead-meta span + span {
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.18);
}

.image-frame-readout {
  display: grid;
  min-width: 218px;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 15px;
  padding: 10px 14px 10px 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.035);
}

.image-frame-stage {
  display: grid;
  width: 96px;
  height: 72px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background-color: rgba(255, 255, 255, 0.025);
}

.image-frame-shape {
  display: block;
  max-width: 70px;
  max-height: 50px;
  border: 2px solid var(--image-mint);
}

.image-frame-readout small,
.image-frame-readout strong {
  display: block;
  font-family: var(--brand-font-mono);
}

.image-frame-readout small {
  margin-bottom: 5px;
  color: #7e8795;
  font-size: 11px;
}

.image-frame-readout strong {
  color: #fff;
  font-size: 13px;
}

.image-compose {
  padding-block: 28px 34px;
  border: 0;
}

.image-section-heading,
.image-history-heading {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.image-section-index {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 1px solid var(--image-line-strong);
  color: var(--image-muted);
  font-family: var(--brand-font-mono);
  font-size: 11px;
}

.image-section-heading > div:last-child > span,
.image-history-title > span {
  color: var(--image-blue);
  font-family: var(--brand-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.image-section-heading h2,
.image-history-heading h2 {
  margin: 2px 0 0;
  color: var(--image-ink);
  font-family: var(--brand-font-display);
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}

.image-compose-board {
  display: grid;
  overflow: hidden;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  border: 1px solid var(--image-line-strong);
  border-radius: var(--brand-radius-md);
  background: var(--image-paper);
  box-shadow: 7px 7px 0 color-mix(in srgb, var(--image-ink) 7%, transparent);
}

.image-prompt-column {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 18px;
  padding: clamp(24px, 3vw, 34px);
  border-top: 5px solid var(--image-blue);
  background: color-mix(in srgb, var(--image-blue-soft) 44%, var(--image-paper));
}

.image-settings-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-left: 1px solid var(--image-line);
  background: var(--image-paper-muted);
}

.image-field {
  gap: 9px;
}

.image-field-label {
  align-items: center;
  color: var(--image-ink);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.4;
}

.image-field-label em {
  margin-left: 5px;
  color: var(--image-muted);
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
}

.image-field-label b {
  font-size: 12px;
  font-weight: 400;
}

.image-field textarea {
  display: block;
  min-height: 0;
  resize: none;
  border: 0;
  border-radius: 0;
  outline: 0;
  background: transparent;
  padding: 0;
  color: var(--image-ink);
}

.image-field--primary textarea {
  height: 190px;
  min-height: 190px;
  font-size: 17px;
  line-height: 1.75;
}

.image-field--negative {
  padding-top: 16px;
  border-top: 1px solid var(--image-line);
}

.image-field--negative textarea {
  height: 72px;
  min-height: 72px;
  color: var(--image-muted);
  font-size: 14px;
  line-height: 1.6;
}

.image-field textarea:hover,
.image-field textarea:focus {
  border: 0;
  background: transparent;
}

.image-setting-group {
  padding: 22px;
}

.image-setting-group + .image-setting-group {
  border-top: 1px solid var(--image-line);
}

.image-setting-group--reference {
  border-top: 5px solid var(--image-mint);
  background: color-mix(in srgb, var(--image-mint) 10%, var(--image-paper-muted));
}

.image-setting-group--size {
  border-top: 5px solid var(--image-yellow) !important;
  background: color-mix(in srgb, var(--image-yellow) 9%, var(--image-paper-muted));
}

.image-setting-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 13px;
}

.image-setting-heading span,
.image-setting-heading strong {
  display: block;
}

.image-setting-heading span {
  margin-bottom: 3px;
  color: var(--image-blue);
  font-family: var(--brand-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.image-setting-group--reference .image-setting-heading span {
  color: color-mix(in srgb, var(--image-mint) 76%, var(--image-ink));
}

.image-setting-group--size .image-setting-heading span {
  color: color-mix(in srgb, var(--image-yellow) 76%, var(--image-ink));
}

.image-setting-heading strong {
  color: var(--image-ink);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.4;
}

.image-setting-heading b {
  color: var(--image-muted);
  font-family: var(--brand-font-mono);
  font-size: 11px;
  font-weight: 400;
}

.image-reference-strip {
  gap: 7px;
  margin-bottom: 10px;
}

.image-reference-item,
.image-reference-add {
  width: 58px;
  height: 58px;
  flex-basis: 58px;
  border-radius: var(--brand-radius-sm);
  background: var(--image-paper);
}

.image-reference-add {
  border-style: dashed;
  color: var(--image-muted);
  font-size: 12px;
}

.image-reference-add:hover {
  background: var(--image-blue-soft);
}

.image-reference-url {
  width: 100%;
  height: 40px;
  border-color: var(--image-line);
  border-radius: var(--brand-radius-sm);
  background: var(--image-paper);
}

.image-reference-url input {
  font-size: 13px;
}

.image-reference-url button {
  height: 38px;
}

.image-size-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.image-size-option {
  display: grid;
  min-width: 0;
  min-height: 82px;
  padding: 9px 5px 8px;
  place-items: center;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-sm);
  background: var(--image-paper);
  color: var(--image-muted);
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
}

.image-size-option:hover {
  border-color: var(--image-blue);
  color: var(--image-blue);
}

.image-size-option.is-active {
  border-color: var(--image-blue);
  background: var(--image-blue);
  color: #fff;
  transform: translateY(-1px);
}

.image-size-icon {
  display: grid;
  width: 30px;
  height: 24px;
  place-items: center;
}

.image-size-icon i {
  display: block;
  width: auto;
  max-width: 27px;
  height: 18px;
  max-height: 21px;
  border: 1px solid currentColor;
}

.image-size-option strong,
.image-size-option small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-size-option strong {
  color: var(--image-ink);
  font-size: 14px;
  line-height: 1.3;
}

.image-size-option.is-active strong {
  color: #fff;
}

.image-size-option small {
  font-family: var(--brand-font-mono);
  font-size: 11px;
}

.image-custom-size {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr);
  align-items: end;
  gap: 6px;
  margin-top: 10px;
}

.image-custom-size label {
  min-width: 0;
}

.image-custom-size label span {
  display: block;
  margin-bottom: 4px;
  color: var(--image-muted);
  font-size: 12px;
}

.image-custom-size input {
  width: 100%;
  min-width: 0;
  height: 34px;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-sm);
  outline: 0;
  background: var(--image-paper);
  padding: 0 8px;
  color: var(--image-ink);
  font-family: var(--brand-font-mono);
  font-size: 12px;
}

.image-custom-size input:focus {
  border-color: var(--image-blue);
}

.image-custom-size > b {
  padding-bottom: 8px;
  color: var(--image-muted);
  text-align: center;
}

.image-size-error {
  display: block;
  margin-top: 6px;
  color: var(--image-coral);
  font-size: 11px;
}

.image-generate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding: 17px 20px;
  border-top: 1px solid var(--image-line);
  background: color-mix(in srgb, var(--image-coral) 7%, var(--image-paper));
}

.image-generate-row > span {
  color: var(--image-muted);
  font-family: var(--brand-font-mono);
  font-size: 11px;
}

.image-generate-button {
  min-width: 142px;
  height: 40px;
  border-color: var(--image-blue);
  border-radius: var(--brand-radius-sm);
  background: var(--image-blue);
  box-shadow: 3px 3px 0 var(--image-ink);
  font-size: 14px;
}

.image-generate-button:hover:not(:disabled) {
  background: var(--brand-blue-strong);
  box-shadow: 2px 2px 0 var(--image-ink);
}

.image-history {
  width: 100%;
  padding: 0;
  border-top: 1px solid var(--image-line-strong);
  background: color-mix(in srgb, var(--image-canvas) 76%, var(--image-ink) 4%);
}

.image-history-inner {
  padding-block: 28px 38px;
}

.image-history-heading {
  margin-bottom: 18px;
}

.image-history-title {
  margin-right: auto;
}

.image-history-count {
  color: var(--image-muted) !important;
  font-family: var(--brand-font-mono);
  font-size: 11px !important;
}

.image-history-heading > button {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-color: var(--image-line-strong);
  background: var(--image-paper);
}

.image-history-grid {
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
}

.image-task,
.image-task-skeleton {
  overflow: hidden;
  border: 1px solid var(--image-line);
  border-radius: var(--brand-radius-md);
  background: var(--image-paper);
}

.image-task {
  box-shadow: 0 1px 0 rgba(21, 23, 28, 0.05);
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.image-task:hover {
  border-color: var(--image-line-strong);
  box-shadow: 0 12px 24px rgba(21, 23, 28, 0.1);
  transform: translateY(-3px);
}

.image-task-media {
  aspect-ratio: 4 / 3;
  border-bottom: 0;
  background-color: #e9edf2;
  background-image: none;
}

html.dark .image-task-media {
  background-color: #11151c;
}

.image-task-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  font-size: 24px;
}

.image-task-fallback span {
  font-size: 11px;
}

.image-task-failure,
.image-task-waiting {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.image-task-failure {
  padding: 15px;
  border: 6px solid color-mix(in srgb, var(--image-coral) 10%, transparent);
  background: color-mix(in srgb, var(--image-coral) 7%, var(--image-paper));
  color: var(--image-coral);
}

.image-task-failure > .el-icon {
  margin-bottom: 7px;
  font-size: 22px;
}

.image-task-failure > span,
.image-task-waiting small {
  font-family: var(--brand-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.image-task-failure strong {
  margin-top: 3px;
  color: var(--image-ink);
  font-size: 15px;
}

.image-task-failure p {
  display: -webkit-box;
  max-width: 100%;
  margin: 7px 0 9px;
  overflow: hidden;
  color: var(--image-muted);
  font-family: var(--brand-font-mono);
  font-size: 11px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.image-task-failure button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--image-coral);
  border-radius: var(--brand-radius-sm);
  background: var(--image-paper);
  padding: 0 9px;
  color: var(--image-coral);
  cursor: pointer;
  font-size: 11px;
}

.image-task-waiting {
  background: var(--image-stage);
  color: #fff;
}

.image-task-aperture {
  position: relative;
  display: block;
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  animation: image-spin 5s linear infinite;
}

.image-task-aperture i {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 1px;
  background: var(--image-mint);
  transform-origin: 0 0;
}

.image-task-aperture i:nth-child(2) { transform: rotate(120deg); }
.image-task-aperture i:nth-child(3) { transform: rotate(240deg); }

.image-task-waiting small {
  color: var(--image-mint);
}

.image-task-waiting strong {
  margin-top: 4px;
  font-size: 14px;
}

.image-task-overlay {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  min-height: 68px;
  padding: 12px;
  background: rgba(15, 17, 21, 0.9);
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 180ms ease, transform 180ms ease;
}

.image-task:hover .image-task-overlay,
.image-task:focus-within .image-task-overlay {
  opacity: 1;
  transform: translateY(0);
}

.image-task-overlay > p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: #fff;
  font-size: 13px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.image-task-actions {
  flex: 0 0 auto;
  gap: 4px;
  padding: 0;
  border: 0;
}

.image-task-actions button {
  width: 28px;
  min-width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.image-task-actions button:hover:not(:disabled) {
  border-color: #fff;
  background: #fff;
  color: #15171c;
}

.image-task-status {
  top: 9px;
  left: 9px;
  border: 0;
  background: rgba(15, 17, 21, 0.78);
  color: #fff !important;
  backdrop-filter: blur(8px);
}

.image-task-processing {
  pointer-events: none;
  background: rgba(49, 94, 251, 0.08);
}

.image-task-caption {
  padding: 11px 12px 10px;
}

.image-task-caption > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--image-muted);
  font-family: var(--brand-font-mono);
  font-size: 11px;
}

.image-task-caption > div:first-child > span {
  color: var(--image-blue);
  font-weight: 700;
}

.image-task-caption > div:first-child b {
  font-weight: 400;
}

.image-task-caption > p {
  overflow: hidden;
  margin: 8px 0 7px;
  color: var(--image-ink);
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-task-meta {
  min-height: 16px;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
}

.image-task-meta span:last-child {
  margin-left: auto;
}

.image-task-meta .is-succeeded { color: var(--brand-success); }
.image-task-meta .is-failed { color: var(--image-coral); }
.image-task-meta .is-queued,
.image-task-meta .is-submitted,
.image-task-meta .is-generating,
.image-task-meta .is-storing { color: var(--image-blue); }

.image-task-skeleton {
  aspect-ratio: 0.92;
}

.image-history-empty {
  min-height: 260px;
  border: 1px dashed var(--image-line-strong);
  background: var(--image-paper);
}

.image-history-empty > .el-icon {
  font-size: 32px;
}

.image-history-sentinel {
  min-height: 64px;
}

@media (max-width: 760px) {
  .image-compose-board {
    grid-template-columns: 1fr;
  }

  .image-settings-column {
    border-top: 1px solid var(--image-line);
    border-left: 0;
  }

  .image-field--primary textarea {
    height: 150px;
    min-height: 150px;
  }
}

@media (max-width: 560px) {
  .image-masthead-inner,
  .image-compose,
  .image-history-inner {
    padding-inline: 14px;
  }

  .image-masthead-inner {
    min-height: 124px;
    gap: 12px;
  }

  .image-masthead-copy h1 {
    font-size: 24px;
  }

  .image-masthead-meta span:last-child {
    display: none;
  }

  .image-frame-readout {
    min-width: 92px;
    grid-template-columns: 1fr;
    padding: 8px;
  }

  .image-frame-stage {
    width: 76px;
    height: 58px;
  }

  .image-frame-readout > div:last-child {
    display: none;
  }

  .image-compose {
    padding-block: 20px 26px;
  }

  .image-prompt-column {
    padding: 20px;
  }

  .image-field--primary textarea {
    height: 128px;
    min-height: 128px;
  }

  .image-field--negative textarea {
    height: 58px;
    min-height: 58px;
  }

  .image-setting-group {
    padding: 18px;
  }

  .image-generate-row {
    align-items: stretch;
    flex-direction: column;
  }

  .image-generate-button {
    width: 100%;
  }

  .image-history-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  .image-task-media {
    aspect-ratio: 1 / 1;
  }

  .image-task-caption {
    padding: 8px;
  }

  .image-task-caption > p {
    margin-block: 6px;
    font-size: 13px;
  }

  .image-task-meta span:nth-child(2) {
    display: none;
  }

  .image-task-failure {
    padding: 9px;
    border-width: 4px;
  }

  .image-task-failure p {
    margin-block: 5px 7px;
    -webkit-line-clamp: 1;
  }

  .image-task-failure button {
    padding-inline: 7px;
  }
}

@media (hover: none) {
  .image-task-overlay {
    min-height: 44px;
    justify-content: flex-end;
    padding: 8px;
    background: transparent;
    opacity: 1;
    transform: none;
  }

  .image-task-overlay > p {
    display: none;
  }

  .image-task-actions button {
    border-color: rgba(255, 255, 255, 0.35);
    background: rgba(15, 17, 21, 0.72);
  }
}

@keyframes image-neon-pulse {
  from {
    filter: blur(10px) brightness(0.9) saturate(0.95);
    opacity: 0.82;
  }
  to {
    filter: blur(10px) brightness(1.3) saturate(1.2);
    opacity: 1;
  }
}

@keyframes image-neon-flow {
  to { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .image-task,
  .image-task-overlay,
  .image-size-option,
  .image-task-aperture {
    transition: none;
  }

  .image-task-aperture {
    animation: none;
  }

  .image-palette-rail::before {
    animation: none;
  }

  .image-palette-rail {
    animation: none;
  }
}
</style>
