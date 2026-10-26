<script setup lang="ts">
import { computed, ref } from 'vue'
import SvgIcon from '@/components/SvgIcon.vue'
import ChatImageTasks from './ChatImageTasks.vue'
import { TOOL_PRESENTATION } from './toolInvocations'
import type { ToolInvocation } from './types'

const props = defineProps<{ tool: ToolInvocation }>()
const emit = defineEmits<{ expandedChange: [expanded: boolean] }>()
const fullContent = ref(false)
const presentation = computed(() => TOOL_PRESENTATION[props.tool.name] ?? { label: props.tool.name, finished: props.tool.name, icon: 'project-tool' })
const label = computed(() => {
  const title = props.tool.status === 'succeeded' ? presentation.value.finished : presentation.value.label
  if (props.tool.name === 'generate_image') {
    const prompt = props.tool.imageTasks?.[0]?.prompt || props.tool.args.prompt
    if (typeof prompt === 'string') return `${title} · ${prompt}`
  }
  if (props.tool.name === 'get_file_list' && props.tool.status === 'succeeded') {
    const data = (props.tool.result as { data?: unknown } | undefined)?.data
    if (Array.isArray(data)) return `${title} · ${data.length} 项`
  }
  const path = props.tool.args.path
  return typeof path === 'string' ? `${title} · ${path}` : title
})
const statusLabel = computed(() => ({ running: '执行中', succeeded: '已完成', failed: '失败', cancelled: '已停止' })[props.tool.status])
const result = computed(() => (typeof props.tool.result === 'string' ? props.tool.result : JSON.stringify(props.tool.result, null, 2)))
const resultText = computed(() => (fullContent.value ? result.value : result.value?.slice(0, 2000)))
const args = computed(() => JSON.stringify(props.tool.args, null, 2))
const argsText = computed(() => (fullContent.value ? args.value : args.value.slice(0, 2000)))
const truncated = computed(() => !fullContent.value && (args.value.length > 2000 || (result.value?.length ?? 0) > 2000))
function toggle() {
  emit('expandedChange', !props.tool.expanded)
}
</script>

<template>
  <div class="chat-tool-invocation" :class="`is-${tool.status}`">
    <button type="button" class="chat-tool-invocation-row" :aria-expanded="!!tool.expanded" @click="toggle">
      <SvgIcon :name="presentation.icon" class="chat-tool-icon" />
      <span class="chat-tool-label" :title="label">{{ label }}</span>
      <span class="chat-tool-running" v-if="tool.status === 'running'" aria-label="执行中" />
      <span class="chat-tool-status" v-else-if="tool.status !== 'succeeded'">{{ statusLabel }}</span>
      <span v-if="tool.durationMs != null" class="chat-tool-duration">{{ (tool.durationMs / 1000).toFixed(1) }} 秒</span>
      <SvgIcon name="chevron-down" class="chat-tool-arrow" :class="{ 'is-expanded': tool.expanded }" />
    </button>
    <div v-if="tool.expanded" class="chat-tool-details">
      <code>{{ tool.name }}</code>
      <div class="chat-tool-detail-heading">调用参数</div>
      <pre>{{ argsText }}</pre>
      <div class="chat-tool-detail-heading">调用结果</div>
      <ChatImageTasks v-if="tool.imageTasks?.length" :tasks="tool.imageTasks" compact />
      <pre v-else-if="resultText">{{ resultText }}</pre>
      <p v-else>{{ tool.error || (tool.status === 'running' ? '等待工具返回结果…' : statusLabel) }}</p>
      <p v-if="tool.error && resultText" class="chat-tool-error">{{ tool.error }}</p>
      <button v-if="truncated || fullContent" type="button" class="chat-tool-full-content" @click="fullContent = !fullContent">
        {{ fullContent ? '收起完整内容' : '查看完整内容' }}
      </button>
      <div class="chat-tool-detail-meta">
        <span>{{ statusLabel }}</span
        ><span>{{ tool.toolCallId }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-tool-invocation {
  margin: 5px 0;
  min-width: 0;
}
.chat-tool-invocation-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  border: 0;
  padding: 4px 0;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
}
.chat-tool-icon,
.chat-tool-arrow {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}
.chat-tool-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-tool-duration,
.chat-tool-status {
  flex-shrink: 0;
  font-size: 11px;
}
.chat-tool-arrow {
  opacity: 0;
  transition:
    transform 160ms ease,
    opacity 160ms ease;
}
.chat-tool-invocation-row:hover .chat-tool-arrow,
.chat-tool-invocation-row:focus-visible .chat-tool-arrow,
.chat-tool-arrow.is-expanded {
  opacity: 1;
}
.chat-tool-arrow.is-expanded {
  transform: rotate(180deg);
}
.chat-tool-invocation-row:hover {
  color: var(--app-text-primary);
}
.is-failed .chat-tool-status,
.chat-tool-error {
  color: var(--app-danger);
}
.chat-tool-running {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  border: 1.5px solid var(--app-border);
  border-top-color: var(--app-accent);
  border-radius: 50%;
  animation: tool-spin 0.8s linear infinite;
}
.chat-tool-details {
  margin: 5px 0 14px 23px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  font-size: 12px;
}
.chat-tool-details code,
.chat-tool-detail-heading,
.chat-tool-detail-meta {
  color: var(--app-text-secondary);
  font-size: 11px;
}
.chat-tool-details pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 5px 0 10px;
  padding: 8px;
  border-radius: 5px;
  background: var(--app-bg-subtle);
  font: 11px/1.7 var(--brand-font-mono);
}
.chat-tool-detail-heading {
  margin-top: 10px;
}
.chat-tool-detail-meta {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  margin-top: 10px;
  overflow-wrap: anywhere;
}
.chat-tool-full-content {
  color: var(--app-accent);
  border: 0;
  background: none;
  padding: 4px 0;
  cursor: pointer;
  font-size: 12px;
}
@keyframes tool-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 480px) {
  .chat-tool-details {
    margin-left: 0;
  }
  .chat-tool-duration {
    display: none;
  }
}
@media (hover: none), (pointer: coarse) {
  .chat-tool-arrow {
    opacity: 1;
  }
  .chat-tool-invocation-row {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-tool-arrow {
    transition: none;
  }
  .chat-tool-running {
    animation: none;
  }
}
</style>
