import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

const STORAGE_KEY = 'gameagent-workspace-split'
const MAX_CHAT_FRACTION = 1.5 / (1.5 + 1)

export function workspaceSplitBounds(width: number, gutter = 6) {
  const available = Math.max(0, width - gutter)
  const minimum = Math.min(320, available * 0.4)
  return { available, min: minimum, max: Math.min(available * MAX_CHAT_FRACTION, available - minimum) }
}

export function clampWorkspaceSplit(left: number, bounds: ReturnType<typeof workspaceSplitBounds>) {
  return Math.max(bounds.min, Math.min(bounds.max, left))
}

export function useWorkspaceSplit(shell: Ref<HTMLElement | null>) {
  const leftWidth = ref(0)
  const availableWidth = ref(0)
  const minWidth = ref(0)
  const maxWidth = ref(0)
  const resizing = ref(false)
  let preferredFraction: number | null = null
  let observer: ResizeObserver | null = null
  let handle: HTMLElement | null = null
  let pointerId: number | null = null

  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(value) && value > 0 && value <= MAX_CHAT_FRACTION) preferredFraction = value
  } catch {
    // 禁用存储时仍可在当前工作台调整宽度。
  }

  function measure() {
    const element = shell.value
    if (!element) return null
    const gutter = element.querySelector<HTMLElement>('.workspace-splitter')?.offsetWidth ?? 6
    const bounds = workspaceSplitBounds(element.clientWidth, gutter)
    availableWidth.value = bounds.available
    minWidth.value = bounds.min
    maxWidth.value = bounds.max
    return bounds
  }

  function layout() {
    const bounds = measure()
    if (!bounds || !bounds.available) return
    const defaultWidth = Math.min(440, Math.max(340, bounds.available * 0.31))
    leftWidth.value = clampWorkspaceSplit(preferredFraction === null ? defaultWidth : bounds.available * preferredFraction, bounds)
  }

  function persist() {
    if (!availableWidth.value) return
    preferredFraction = Math.min(MAX_CHAT_FRACTION, leftWidth.value / availableWidth.value)
    try {
      localStorage.setItem(STORAGE_KEY, String(preferredFraction))
    } catch {
      // 当前会话中的宽度仍保持生效。
    }
  }

  function finish() {
    if (!resizing.value) return
    resizing.value = false
    persist()
    if (handle && pointerId !== null && handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
    handle = null
    pointerId = null
  }

  function start(event: PointerEvent) {
    if (event.button !== 0 || window.matchMedia('(max-width: 767px)').matches) return
    event.preventDefault()
    measure()
    handle = event.currentTarget as HTMLElement
    pointerId = event.pointerId
    handle.focus({ preventScroll: true })
    handle.setPointerCapture(event.pointerId)
    resizing.value = true
  }

  function move(event: PointerEvent) {
    if (!resizing.value || event.pointerId !== pointerId || !shell.value) return
    const bounds = measure()
    if (!bounds) return
    const rect = shell.value.getBoundingClientRect()
    const gutter = rect.width - bounds.available
    leftWidth.value = clampWorkspaceSplit(event.clientX - rect.left - gutter / 2, bounds)
    preferredFraction = Math.min(MAX_CHAT_FRACTION, leftWidth.value / bounds.available)
  }

  function reset() {
    finish()
    preferredFraction = null
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 不影响恢复默认布局。
    }
    layout()
  }

  function keydown(event: KeyboardEvent) {
    const bounds = measure()
    if (!bounds || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const step = event.shiftKey ? 32 : 16
    const width = event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : leftWidth.value + (event.key === 'ArrowRight' ? step : -step)
    leftWidth.value = clampWorkspaceSplit(width, bounds)
    persist()
  }

  watch(
    shell,
    (element) => {
      observer?.disconnect()
      if (!element) return
      observer = new ResizeObserver(() => {
        if (window.matchMedia('(max-width: 767px)').matches) finish()
        layout()
      })
      observer.observe(element)
      layout()
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    finish()
    observer?.disconnect()
  })

  const percent = (width: number) => (availableWidth.value ? Math.round((width / availableWidth.value) * 100) : 0)
  return {
    leftWidth,
    resizing,
    start,
    move,
    finish,
    reset,
    keydown,
    percent: computed(() => percent(leftWidth.value)),
    minPercent: computed(() => percent(minWidth.value)),
    maxPercent: computed(() => percent(maxWidth.value)),
  }
}
