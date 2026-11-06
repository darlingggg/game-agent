<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import SvgIcon from '@/components/SvgIcon.vue'
import ChatToolInvocation from './ChatToolInvocation.vue'
import { summarizeTools, TOOL_PRESENTATION } from './toolInvocations'
import type { ToolInvocation } from './types'

const props = defineProps<{ tools: ToolInvocation[] }>()
const emit = defineEmits<{ expandedChange: [tool: ToolInvocation, expanded: boolean] }>()
const expanded = ref(true)
const list = ref<HTMLElement>()
const listId = useId()
const followLatest = ref(true)
const summary = computed(() => summarizeTools(props.tools))
const title = computed(() => {
  const actions = [...new Set(props.tools.map((tool) => TOOL_PRESENTATION[tool.name]?.label ?? '执行工具'))]
  const label = actions.slice(0, 2).join('、') + (actions.length > 2 ? '等操作' : '')
  const prefix = summary.value.running ? '正在' : summary.value.failed || summary.value.cancelled ? '' : '已'
  return prefix + label
})
const status = computed(() =>
  [
    summary.value.running ? `${summary.value.running} 项执行中` : '',
    summary.value.failed ? `${summary.value.failed} 项失败` : '',
    summary.value.cancelled ? `${summary.value.cancelled} 项已停止` : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
const icon = computed(() => TOOL_PRESENTATION[props.tools[0]?.name ?? '']?.icon ?? 'project-tool')

function onScroll() {
  if (!list.value) return
  followLatest.value = list.value.scrollHeight - list.value.scrollTop - list.value.clientHeight <= 24
}

watch(
  () => props.tools.map((tool) => `${tool.toolCallId}:${tool.status}`).join('|'),
  async () => {
    // 用户回看记录或展开详情时不抢滚动；跟随底部时才显示最新调用。
    if (!expanded.value || !followLatest.value || props.tools.some((tool) => tool.expanded)) return
    await nextTick()
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  },
)
</script>

<template>
  <ChatToolInvocation v-if="tools.length === 1 && tools[0]" :tool="tools[0]" @expanded-change="emit('expandedChange', tools[0], $event)" />
  <section v-else class="chat-tool-group" :class="{ 'has-failures': summary.failed }">
    <button type="button" class="chat-tool-group-toggle" :aria-expanded="expanded" :aria-controls="listId" @click="expanded = !expanded">
      <SvgIcon :name="icon" class="chat-tool-group-icon" />
      <span class="chat-tool-group-title" :title="title">{{ title }}</span>
      <SvgIcon name="chevron-down" class="chat-tool-group-arrow" :class="{ 'is-expanded': expanded }" />
      <span class="chat-tool-group-count">{{ tools.length }} 项</span>
      <span v-if="status" class="chat-tool-group-status" role="status">{{ status }}</span>
    </button>
    <div :id="listId" v-show="expanded" ref="list" class="chat-tool-group-list" role="region" aria-label="工具调用列表" tabindex="0" @scroll="onScroll">
      <ChatToolInvocation v-for="tool in tools" :key="tool.toolCallId" :tool="tool" compact @expanded-change="emit('expandedChange', tool, $event)" />
    </div>
  </section>
</template>

<style scoped>
.chat-tool-group {
  min-width: 0;
  margin: 6px 0 12px;
  color: var(--app-text-secondary);
}
.chat-tool-group-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 30px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.chat-tool-group-icon,
.chat-tool-group-arrow {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.chat-tool-group-title {
  min-width: 0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-tool-group-arrow {
  transition: transform 160ms ease;
}
.chat-tool-group-arrow.is-expanded {
  transform: rotate(180deg);
}
.chat-tool-group-count,
.chat-tool-group-status {
  flex-shrink: 0;
  color: var(--app-text-muted);
  font-size: 12px;
  white-space: nowrap;
}
.chat-tool-group-count {
  margin-left: auto;
}
.has-failures .chat-tool-group-status {
  color: var(--app-danger);
}
.chat-tool-group-toggle:hover {
  color: var(--app-text-primary);
}
.chat-tool-group-list {
  max-height: 224px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) transparent;
  padding: 0 6px 0 0;
}
.chat-tool-group-toggle:focus-visible,
.chat-tool-group-list:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
  border-radius: 4px;
}
@media (hover: none), (pointer: coarse) {
  .chat-tool-group-toggle {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-tool-group-arrow {
    transition: none;
  }
}
</style>
