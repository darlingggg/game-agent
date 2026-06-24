<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useLogContext } from './logContext'
import {
  getAiCollapsedPreview,
  shouldCollapseAiLog,
} from './parsePersistedLog'
import { TERMINAL_HEADER_LINES, TERMINAL_SAMPLE_LOGS } from './terminalLogs'
import type { AiLogEntry, DisplayLogEntry, ToolLogEntry } from './logTypes'

defineOptions({
  name: 'LogPanel',
})

const projectStore = useProjectStore()
const logContext = useLogContext()

/** 终端滚动容器 */
const terminalRef = ref<HTMLElement | null>(null)

/** 静态头部日志 */
const staticLines = [...TERMINAL_HEADER_LINES, ...TERMINAL_SAMPLE_LOGS]

/** 历史日志 */
const historyEntries = computed(() => logContext.historyEntries.value)

/** 实时日志 */
const liveEntries = computed(() => logContext.liveEntries.value)

/**
 * 格式化日志时间
 * @param value ISO 时间字符串
 */
function formatLogTime(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * 判断是否为 AI 日志
 * @param entry 日志条目
 */
function isAiEntry(entry: DisplayLogEntry): entry is AiLogEntry {
  return entry.prefix === 'ai'
}

/**
 * 判断是否为工具日志
 * @param entry 日志条目
 */
function isToolEntry(entry: DisplayLogEntry): entry is ToolLogEntry {
  return entry.prefix === 'tool'
}

/**
 * 获取工具状态标记
 * @param status 工具状态
 */
function getToolStatusMark(status: ToolLogEntry['status']): string {
  if (status === 'success') return '✅'
  if (status === 'error' || status === 'aborted') return '❌'
  return ''
}

/**
 * 获取工具下拉详情文本
 * @param entry 工具日志
 */
function getToolDetailText(entry: ToolLogEntry): string {
  const parts: string[] = []
  if (entry.params) {
    parts.push(`参数:\n${entry.params}`)
  }
  if (entry.result) {
    parts.push(`结果:\n${entry.result}`)
  }
  return parts.join('\n\n')
}

/**
 * 获取 AI 日志展示文本
 * @param entry AI 日志
 */
function getAiDisplayText(entry: AiLogEntry): string {
  if (!shouldCollapseAiLog(entry.content, entry.streaming) || entry.expanded) {
    return entry.content
  }
  return getAiCollapsedPreview(entry.content)
}

/**
 * 切换工具结果下拉
 * @param entry 工具日志
 */
function toggleToolDetail(entry: ToolLogEntry) {
  if (!entry.result && entry.status === 'loading') return
  entry.expanded = !entry.expanded
}

/**
 * 切换 AI 长文本折叠
 * @param entry AI 日志
 */
function toggleAiDetail(entry: AiLogEntry) {
  if (!shouldCollapseAiLog(entry.content, entry.streaming)) return
  entry.expanded = !entry.expanded
}

/**
 * 滚动到底部
 */
async function scrollToBottom() {
  await nextTick()
  const el = terminalRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

/** 项目就绪后加载历史日志 */
watch(
  () => projectStore.currentProject?.id,
  (projectId) => {
    if (projectId) {
      void logContext.loadHistory(projectId)
    }
  },
  { immediate: true },
)

/** 实时日志变化时自动滚动 */
watch(
  () => liveEntries.value.length,
  () => {
    void scrollToBottom()
  },
)

/** 监听 AI 流式内容长度变化 */
watch(
  () => liveEntries.value.map((item) => (item.prefix === 'ai' ? item.content.length : 0)).join(','),
  () => {
    void scrollToBottom()
  },
)

onMounted(() => {
  void scrollToBottom()
})
</script>

<template>
  <div ref="terminalRef" class="log-panel">
    <div v-for="(line, index) in staticLines" :key="`static-${index}`" class="log-panel-line">
      {{ line }}
    </div>

    <template v-for="entry in historyEntries" :key="entry.id">
      <div v-if="entry.prefix === 'plain'" class="log-panel-line">
        {{ entry.content }}
      </div>

      <div v-else-if="isAiEntry(entry)" class="log-panel-line log-panel-line--ai">
        <span class="log-panel-tag log-panel-tag--ai"
          :data-time="entry.createdAt ? formatLogTime(entry.createdAt) : undefined">[ai]</span>
        <button v-if="shouldCollapseAiLog(entry.content, entry.streaming)" type="button" class="log-panel-ai-btn"
          @click="toggleAiDetail(entry)">
          <span class="log-panel-text">{{ getAiDisplayText(entry) }}</span>
          <span v-if="!entry.expanded" class="log-panel-ai-ellipsis">...</span>
          <svg class="log-panel-tool-arrow" :class="{ 'log-panel-tool-arrow--expanded': entry.expanded }"
            viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        </button>
        <span v-else class="log-panel-text">{{ entry.content }}</span>
      </div>

      <div v-else-if="isToolEntry(entry)" class="log-panel-line log-panel-line--tool">
        <span class="log-panel-tag log-panel-tag--tool"
          :data-time="entry.createdAt ? formatLogTime(entry.createdAt) : undefined">[tool]</span>
        <button type="button" class="log-panel-tool-btn" @click="toggleToolDetail(entry)">
          <span>{{ entry.content }}</span>
          <svg class="log-panel-tool-arrow" :class="{ 'log-panel-tool-arrow--expanded': entry.expanded }"
            viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        </button>
        <span class="log-panel-status">{{ getToolStatusMark(entry.status) }}</span>
        <pre v-if="entry.expanded && getToolDetailText(entry)"
          class="log-panel-tool-detail">{{ getToolDetailText(entry) }}</pre>
      </div>
    </template>

    <template v-for="entry in liveEntries" :key="entry.id">
      <div v-if="entry.prefix === 'ai'" class="log-panel-line log-panel-line--ai">
        <span class="log-panel-tag log-panel-tag--ai"
          :data-time="entry.createdAt ? formatLogTime(entry.createdAt) : undefined">[ai]</span>
        <button v-if="shouldCollapseAiLog(entry.content, entry.streaming)" type="button" class="log-panel-ai-btn"
          @click="toggleAiDetail(entry)">
          <span class="log-panel-text">{{ getAiDisplayText(entry) }}</span>
          <span v-if="!entry.expanded" class="log-panel-ai-ellipsis">...</span>
          <svg class="log-panel-tool-arrow" :class="{ 'log-panel-tool-arrow--expanded': entry.expanded }"
            viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        </button>
        <span v-else class="log-panel-text">{{ entry.content }}</span>
        <span v-if="entry.streaming" class="log-panel-loading" aria-label="输出中" />
      </div>

      <div v-else class="log-panel-line log-panel-line--tool">
        <span class="log-panel-tag log-panel-tag--tool"
          :data-time="entry.createdAt ? formatLogTime(entry.createdAt) : undefined">[tool]</span>
        <button type="button" class="log-panel-tool-btn"
          :class="{ 'log-panel-tool-btn--disabled': !entry.result && entry.status === 'loading' }"
          @click="toggleToolDetail(entry)">
          <span>{{ entry.content }}</span>
          <svg v-if="entry.result || entry.status !== 'loading'" class="log-panel-tool-arrow"
            :class="{ 'log-panel-tool-arrow--expanded': entry.expanded }" viewBox="0 0 24 24" fill="none"
            aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        </button>
        <span v-if="entry.status === 'loading'" class="log-panel-loading" aria-label="执行中" />
        <span v-else class="log-panel-status">{{ getToolStatusMark(entry.status) }}</span>
        <pre v-if="entry.expanded && getToolDetailText(entry)"
          class="log-panel-tool-detail">{{ getToolDetailText(entry) }}</pre>
      </div>
    </template>
  </div>
</template>

<style scoped>
.log-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  background-color: #000;
  color: #ccc;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  scrollbar-width: thin;
  scrollbar-color: #444 #111;
}

.log-panel::-webkit-scrollbar {
  width: 6px;
}

.log-panel::-webkit-scrollbar-track {
  background: #111;
}

.log-panel::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 999px;
  border: 1px solid transparent;
  background-clip: padding-box;
  transition: background-color 0.2s ease;
}

.log-panel::-webkit-scrollbar-thumb:hover {
  background-color: #555;
}

.log-panel-line {
  min-height: 1.5em;
}

.log-panel-line--ai,
.log-panel-line--tool {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.log-panel-tag {
  position: relative;
  flex-shrink: 0;
  font-weight: 700;
  cursor: default;
}

.log-panel-tag[data-time]:hover::after {
  content: attr(data-time);
  position: absolute;
  left: calc(100% + 0.375rem);
  top: 50%;
  transform: translateY(-50%);
  padding: 0.125rem 0.375rem;
  border: 1px solid #444;
  border-radius: 4px;
  background-color: #222;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  z-index: 1;
}

.log-panel-tag--ai {
  color: #7ec8ff;
}

.log-panel-tag--tool {
  color: #f5c26b;
}

.log-panel-text {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.log-panel-ai-btn,
.log-panel-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  border: none;
  background: none;
  color: #ccc;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.log-panel-ai-btn:hover,
.log-panel-tool-btn:hover:not(.log-panel-tool-btn--disabled) {
  color: #fff;
}

.log-panel-tool-btn--disabled {
  cursor: default;
}

.log-panel-ai-ellipsis {
  color: #888;
}

.log-panel-tool-arrow {
  width: 0.875rem;
  height: 0.875rem;
  transition: transform 0.2s ease;
}

.log-panel-tool-arrow--expanded {
  transform: rotate(180deg);
}

.log-panel-loading {
  flex-shrink: 0;
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid #555;
  border-top-color: #7ec8ff;
  border-radius: 50%;
  animation: log-spin 0.8s linear infinite;
}

.log-panel-status {
  flex-shrink: 0;
}

.log-panel-tool-detail {
  width: 100%;
  margin: 0.25rem 0 0.5rem;
  padding: 0.5rem 0.625rem;
  border-left: 2px solid #444;
  background-color: #111;
  color: #9cdcfe;
  font-size: 0.8125rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
}

@keyframes log-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
