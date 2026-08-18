<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChatMessage } from './types'

defineOptions({ name: 'ConversationRail' })

interface ConversationTurn {
  id: string
  title: string
  userPreview: string
  assistantPreview: string
}

const props = defineProps<{
  messages: ChatMessage[]
  activeMessageId?: string
}>()

const emit = defineEmits<{
  select: [messageId: string]
}>()

const ITEM_HEIGHT = 11
const OVERSCAN = 5
const HIDE_DELAY = 160

const viewportRef = ref<HTMLElement | null>(null)
const viewportHeight = ref(0)
const railScrollTop = ref(0)
const hoveredTurnId = ref('')
const previewPosition = ref({ top: 0, left: 0 })
let hideTimer: ReturnType<typeof setTimeout> | undefined
let resizeObserver: ResizeObserver | undefined

function plainText(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/```[\s\S]*?```/g, '[代码]')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function shorten(content: string, limit: number): string {
  const text = plainText(content)
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

const turns = computed<ConversationTurn[]>(() => {
  const result: ConversationTurn[] = []

  props.messages.forEach((message, index) => {
    if (message.role !== 'user') return

    const response = props.messages.slice(index + 1).find((item) => item.role === 'assistant')
    const nextUserIndex = props.messages.slice(index + 1).findIndex((item) => item.role === 'user')
    const responseIndex = props.messages.slice(index + 1).findIndex((item) => item.role === 'assistant')
    const hasResponseBeforeNextTurn = responseIndex >= 0 && (nextUserIndex < 0 || responseIndex < nextUserIndex)
    const assistantContent = hasResponseBeforeNextTurn ? [response?.vision?.answer, response?.content].filter(Boolean).join(' ') : ''
    const userPreview = shorten(message.content, 96) || '图片消息'

    result.push({
      id: message.id,
      title: shorten(message.content, 28) || '图片消息',
      userPreview,
      assistantPreview: shorten(assistantContent, 112),
    })
  })

  return result
})

const effectiveActiveId = computed(() => props.activeMessageId || turns.value.at(-1)?.id || '')
const activeIndex = computed(() => turns.value.findIndex((turn) => turn.id === effectiveActiveId.value))
const hoveredIndex = computed(() => turns.value.findIndex((turn) => turn.id === hoveredTurnId.value))
const hoveredTurn = computed(() => turns.value.find((turn) => turn.id === hoveredTurnId.value))
const contentOffset = computed(() => Math.max((viewportHeight.value - turns.value.length * ITEM_HEIGHT) / 2, 0))
const virtualStart = computed(() => Math.max(0, Math.floor((railScrollTop.value - contentOffset.value) / ITEM_HEIGHT) - OVERSCAN))
const virtualEnd = computed(() => Math.min(turns.value.length, Math.ceil((railScrollTop.value + viewportHeight.value - contentOffset.value) / ITEM_HEIGHT) + OVERSCAN))
const visibleTurns = computed(() =>
  turns.value.slice(virtualStart.value, virtualEnd.value).map((turn, index) => ({
    ...turn,
    index: virtualStart.value + index,
  })),
)

function updateViewportHeight() {
  const nextHeight = viewportRef.value?.clientHeight ?? 0
  if (viewportHeight.value === nextHeight) return
  viewportHeight.value = nextHeight
  void keepActiveTurnVisible()
}

function handleRailScroll(event: Event) {
  railScrollTop.value = (event.currentTarget as HTMLElement).scrollTop
  hoveredTurnId.value = ''
}

function showPreview(turnId: string, event: MouseEvent | FocusEvent) {
  if (hideTimer) clearTimeout(hideTimer)
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const previewWidth = Math.min(320, window.innerWidth - 24)

  previewPosition.value = {
    top: Math.min(Math.max(rect.top + rect.height / 2, 64), window.innerHeight - 64),
    left: Math.min(Math.max(rect.right + 8, 12), window.innerWidth - previewWidth - 12),
  }
  hoveredTurnId.value = turnId
}

function scheduleHidePreview() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    hoveredTurnId.value = ''
  }, HIDE_DELAY)
}

function neighboringLevel(index: number): 0 | 1 | 2 {
  if (hoveredIndex.value < 0) return 0
  const distance = Math.abs(index - hoveredIndex.value)
  return distance === 1 ? 1 : distance === 2 ? 2 : 0
}

async function keepActiveTurnVisible() {
  await nextTick()
  const viewport = viewportRef.value
  if (!viewport || activeIndex.value < 0) return

  const itemTop = contentOffset.value + activeIndex.value * ITEM_HEIGHT
  const itemBottom = itemTop + ITEM_HEIGHT
  if (itemTop < viewport.scrollTop) viewport.scrollTop = itemTop
  else if (itemBottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = itemBottom - viewport.clientHeight
}

async function observeViewport() {
  await nextTick()
  const viewport = viewportRef.value
  if (!viewport) return

  updateViewportHeight()
  resizeObserver ??= new ResizeObserver(updateViewportHeight)
  resizeObserver.observe(viewport)
}

watch(
  [effectiveActiveId, () => turns.value.length],
  () => {
    void observeViewport()
    void keepActiveTurnVisible()
  },
  { immediate: true },
)

onMounted(() => {
  void observeViewport()
  void keepActiveTurnVisible()
})

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
  resizeObserver?.disconnect()
})
</script>

<template>
  <nav v-if="turns.length" class="conversation-rail" aria-label="当前会话内容导航">
    <div ref="viewportRef" class="conversation-rail-viewport" @scroll.passive="handleRailScroll">
      <div class="conversation-rail-track" :style="{ height: `${Math.max(turns.length * ITEM_HEIGHT, viewportHeight)}px` }">
        <button
          v-for="turn in visibleTurns"
          :key="turn.id"
          type="button"
          class="conversation-rail-tick"
          :class="{
            'conversation-rail-tick--active': effectiveActiveId === turn.id,
            'conversation-rail-tick--near-1': neighboringLevel(turn.index) === 1,
            'conversation-rail-tick--near-2': neighboringLevel(turn.index) === 2,
          }"
          :style="{ top: `${contentOffset + turn.index * ITEM_HEIGHT}px` }"
          :aria-label="`跳转到：${turn.title}`"
          @click="emit('select', turn.id)"
          @mouseenter="showPreview(turn.id, $event)"
          @mouseleave="scheduleHidePreview"
          @focus="showPreview(turn.id, $event)"
          @blur="scheduleHidePreview"
        >
          <span class="conversation-rail-line" aria-hidden="true" />
        </button>
      </div>
    </div>
    <Teleport to="body">
      <aside v-if="hoveredTurn" class="conversation-rail-preview" role="tooltip" :style="{ top: `${previewPosition.top}px`, left: `${previewPosition.left}px` }">
        <strong>{{ hoveredTurn.title }}</strong>
        <span class="conversation-rail-user">{{ hoveredTurn.userPreview }}</span>
        <span v-if="hoveredTurn.assistantPreview" class="conversation-rail-assistant"><i />{{ hoveredTurn.assistantPreview }}</span>
      </aside>
    </Teleport>
  </nav>
</template>

<style scoped>
.conversation-rail {
  position: relative;
  z-index: 5;
  width: 30px;
  flex: 0 0 30px;
  border-right: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-bg-muted) 88%, transparent);
}

.conversation-rail-viewport {
  position: absolute;
  inset: 12px 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.conversation-rail-viewport::-webkit-scrollbar {
  display: none;
}

.conversation-rail-track {
  position: relative;
  width: 100%;
}

.conversation-rail-tick {
  position: absolute;
  left: 0;
  display: flex;
  width: 100%;
  height: 11px;
  align-items: center;
  padding: 0 7px;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.conversation-rail-line {
  display: block;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--app-text-muted);
  opacity: 0.62;
  transition:
    width 0.16s ease,
    background-color 0.16s ease,
    opacity 0.16s ease;
}

.conversation-rail-tick:hover .conversation-rail-line,
.conversation-rail-tick:focus-visible .conversation-rail-line {
  width: 18px;
  opacity: 1;
}

.conversation-rail-tick:hover .conversation-rail-line,
.conversation-rail-tick:focus-visible .conversation-rail-line {
  background: var(--app-text-primary);
}

.conversation-rail-tick--near-1 .conversation-rail-line {
  width: 13px;
  opacity: 0.78;
}

.conversation-rail-tick--near-2 .conversation-rail-line {
  width: 10px;
  opacity: 0.68;
}

.conversation-rail-tick--active .conversation-rail-line {
  width: 8px;
  background: #315efb;
  box-shadow: 0 0 0 1px color-mix(in srgb, #315efb 24%, transparent);
  opacity: 1;
}

.conversation-rail-tick--active:hover .conversation-rail-line,
.conversation-rail-tick--active:focus-visible .conversation-rail-line {
  width: 18px;
}

.conversation-rail-preview {
  position: fixed;
  z-index: 3000;
  display: grid;
  gap: 5px;
  width: min(320px, calc(100vw - 24px));
  padding: 11px 13px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  background: #292929;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  color: #f5f5f5;
  line-height: 1.45;
  text-align: left;
  transform: translateY(-50%);
  pointer-events: none;
}

.conversation-rail-preview::before {
  position: absolute;
  top: 50%;
  left: -5px;
  width: 9px;
  height: 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: #292929;
  content: '';
  transform: translateY(-50%) rotate(45deg);
}

.conversation-rail-preview strong,
.conversation-rail-preview span {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
}

.conversation-rail-preview strong {
  -webkit-line-clamp: 1;
  font-size: 13px;
  font-weight: 700;
}

.conversation-rail-user,
.conversation-rail-assistant {
  -webkit-line-clamp: 2;
  color: #a9a9a9;
  font-size: 12px;
}

.conversation-rail-assistant {
  position: relative;
  padding-left: 15px;
}

.conversation-rail-assistant i {
  position: absolute;
  top: 7px;
  left: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #8d8d8d;
}

@media (max-width: 720px) {
  .conversation-rail {
    width: 24px;
    flex-basis: 24px;
  }

  .conversation-rail-tick {
    padding-inline: 5px;
  }
}
</style>
