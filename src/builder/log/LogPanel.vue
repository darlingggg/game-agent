<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useBuildContext } from '@/builder/build/buildContext'
import { getBuildStepDetailText, hasBuildStepDetail } from '@/builder/build/buildEvent'
import type { BuildStepStatus } from '@/builder/build/buildTypes'
import { useProjectStore } from '@/stores/project'
import { useLogContext } from './logContext'
import {
  getAiCollapsedPreview,
  shouldCollapseAiLog,
} from './parsePersistedLog'
import { buildTerminalHeaderLines } from './terminalLogs'
import type { AiLogEntry, DisplayLogEntry, ToolLogEntry } from './logTypes'

defineOptions({
  name: 'LogPanel',
})

const projectStore = useProjectStore()
const logContext = useLogContext()
const buildContext = useBuildContext()

/**
 * 解构为顶层 ref，避免模板把 useXxx() 返回值当成 MaybeRef
 * 而编译成 buildContext.value.visible 导致报错
 */
const buildVisible = buildContext.visible
const buildCollapsed = buildContext.collapsed
const buildRunning = buildContext.running
const buildContent = buildContext.content
const buildSteps = buildContext.steps
const buildSummary = buildContext.summary
const buildResultLink = buildContext.resultLink
const buildDurationText = buildContext.durationText
const buildDeploymentId = buildContext.deploymentId
const toggleBuildCollapsed = buildContext.toggleCollapsed
const closeBuildPanel = buildContext.closePanel
const toggleBuildStepExpand = buildContext.toggleStepExpand

/** 构建日志滚动容器 */
const buildLogRef = ref<HTMLElement | null>(null)
const buildBodyRef = ref<HTMLElement | null>(null)

/** 已完成步骤数 */
const completedStepCount = computed(() =>
  buildSteps.value.filter((item) => item.status === 'done').length,
)

/**
 * 获取步骤状态图标
 * @param status 步骤状态
 */
function getBuildStepStatusMark(status: BuildStepStatus): string {
  if (status === 'done') return '✓'
  if (status === 'error') return '✗'
  return '…'
}

/**
 * 获取构建进度文案
 */
function getBuildProgressText(): string {
  const total = buildSteps.value.length
  if (!total) return '准备中...'
  if (buildRunning.value) {
    return `${completedStepCount.value}/${total} 步骤`
  }
  if (buildSummary.value) return '已完成'
  return '构建结束'
}

/** 终端滚动容器 */
const terminalRef = ref<HTMLElement | null>(null)

/** 当前项目会话启动时间（切换项目时刷新） */
const sessionBootAt = ref(new Date())

/** 个性化终端头部日志 */
const staticLines = computed(() => {
  const project = projectStore.currentProject
  return buildTerminalHeaderLines({
    projectTitle: project?.title,
    projectId: project?.id,
    account: project?.account,
    version: project?.currentVersion,
    dirPath: project?.dirPath,
    bootAt: sessionBootAt.value,
  })
})

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

/**
 * 构建日志滚动到底部
 */
async function scrollBuildLogToBottom() {
  await nextTick()
  const el = buildBodyRef.value ?? buildLogRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

/** 项目或会话切换时刷新终端头部信息 */
watch(
  () => [projectStore.currentProject?.id, logContext.currentSessionTitle.value] as const,
  ([projectId]) => {
    if (projectId) {
      sessionBootAt.value = new Date()
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

/** 构建日志变化时自动滚动 */
watch(
  () => [buildContent.value, buildSteps.value.map((item) => item.status).join(',')].join('|'),
  () => {
    void scrollBuildLogToBottom()
  },
)

onMounted(() => {
  void scrollToBottom()
})
</script>

<template>
  <div class="log-panel-wrapper">
    <div v-if="buildVisible" class="log-panel-build-float"
      :class="{ 'log-panel-build-float--collapsed': buildCollapsed }">
      <header class="log-panel-build-header">
        <div class="log-panel-build-heading">
          <span class="log-panel-build-title">项目构建</span>
          <span class="log-panel-build-status">{{ getBuildProgressText() }}</span>
        </div>
        <div class="log-panel-build-actions">
          <button type="button" class="log-panel-build-btn" :title="buildCollapsed ? '展开' : '收起'"
            :aria-label="buildCollapsed ? '展开' : '收起'" @click="toggleBuildCollapsed">
            <svg class="log-panel-build-btn-icon" :class="{ 'log-panel-build-btn-icon--expanded': !buildCollapsed }"
              viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
          </button>
          <button v-if="!buildRunning" type="button" class="log-panel-build-btn" title="关闭"
            aria-label="关闭" @click="closeBuildPanel">
            <svg class="log-panel-build-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </header>
      <div v-show="!buildCollapsed" ref="buildBodyRef" class="log-panel-build-body">
        <div v-if="buildSummary" class="log-panel-build-summary">
          <p class="log-panel-build-summary-text">{{ buildSummary }}</p>
          <p v-if="buildDurationText" class="log-panel-build-summary-meta">
            总耗时 {{ buildDurationText }}
          </p>
          <a v-if="buildResultLink" class="log-panel-build-link" :href="buildResultLink"
            target="_blank" rel="noopener noreferrer">
            {{ buildResultLink }}
          </a>
          <p v-if="buildDeploymentId" class="log-panel-build-summary-meta">
            Deployment ID：{{ buildDeploymentId }}
          </p>
        </div>

        <ul v-if="buildSteps.length" class="log-panel-build-steps">
          <li v-for="step in buildSteps" :key="step.key"
            class="log-panel-build-step" :class="`log-panel-build-step--${step.status}`">
            <button type="button" class="log-panel-build-step-main"
              :class="{ 'log-panel-build-step-main--clickable': hasBuildStepDetail(step) }"
              :disabled="!hasBuildStepDetail(step)" @click="toggleBuildStepExpand(step.key)">
              <span class="log-panel-build-step-mark">{{ getBuildStepStatusMark(step.status) }}</span>
              <span class="log-panel-build-step-title">{{ step.title }}</span>
              <span v-if="step.durationText" class="log-panel-build-step-duration">{{ step.durationText }}</span>
              <span v-if="step.status === 'running'" class="log-panel-build-step-loading" aria-label="执行中" />
              <svg v-if="hasBuildStepDetail(step)" class="log-panel-build-step-arrow"
                :class="{ 'log-panel-build-step-arrow--expanded': step.expanded }" viewBox="0 0 24 24" fill="none"
                aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" />
              </svg>
            </button>
            <p v-if="step.message" class="log-panel-build-step-message">{{ step.message }}</p>
            <pre v-if="step.expanded && getBuildStepDetailText(step)"
              class="log-panel-build-step-detail">{{ getBuildStepDetailText(step) }}</pre>
          </li>
        </ul>

        <div v-if="buildContent" class="log-panel-build-log-section">
          <div class="log-panel-build-log-label">构建日志</div>
          <pre ref="buildLogRef" class="log-panel-build-content">{{ buildContent }}</pre>
        </div>
      </div>
    </div>

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
  </div>
</template>

<style scoped>
.log-panel-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.log-panel-build-float {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 2;
  width: min(32rem, calc(100% - 1.5rem));
  max-height: calc(100% - 1.5rem);
  display: flex;
  flex-direction: column;
  border: 1px solid #444;
  border-radius: 8px;
  background-color: rgba(17, 17, 17, 0.96);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.log-panel-build-float--collapsed {
  max-height: none;
}

.log-panel-build-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid #333;
}

.log-panel-build-heading {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.log-panel-build-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #f5c26b;
}

.log-panel-build-status {
  font-size: 0.75rem;
  color: #7ec8ff;
}

.log-panel-build-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.log-panel-build-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 1px solid #444;
  border-radius: 4px;
  background: #222;
  color: #ccc;
  cursor: pointer;
}

.log-panel-build-btn:hover {
  color: #fff;
  border-color: #666;
}

.log-panel-build-btn-icon {
  width: 0.875rem;
  height: 0.875rem;
  transition: transform 0.2s ease;
}

.log-panel-build-btn-icon--expanded {
  transform: rotate(180deg);
}

.log-panel-build-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  max-height: 24rem;
  scrollbar-width: thin;
  scrollbar-color: #444 #111;
}

.log-panel-build-summary {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid #2a2a2a;
  background-color: #141414;
}

.log-panel-build-summary-text {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: #e6e6e6;
}

.log-panel-build-summary-meta {
  margin: 0.375rem 0 0;
  font-size: 0.75rem;
  color: #888;
}

.log-panel-build-link {
  display: block;
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: #7ec8ff;
  text-decoration: none;
  word-break: break-all;
}

.log-panel-build-link:hover {
  text-decoration: underline;
}

.log-panel-build-steps {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #2a2a2a;
}

.log-panel-build-step {
  margin-bottom: 0.5rem;
}

.log-panel-build-step:last-child {
  margin-bottom: 0;
}

.log-panel-build-step-main {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: #ccc;
  font: inherit;
  text-align: left;
}

.log-panel-build-step-main--clickable {
  cursor: pointer;
}

.log-panel-build-step-main--clickable:hover {
  color: #fff;
}

.log-panel-build-step-main:disabled {
  cursor: default;
}

.log-panel-build-step-mark {
  flex-shrink: 0;
  width: 1rem;
  font-weight: 700;
}

.log-panel-build-step--running .log-panel-build-step-mark {
  color: #7ec8ff;
}

.log-panel-build-step--done .log-panel-build-step-mark {
  color: #6adb8a;
}

.log-panel-build-step--error .log-panel-build-step-mark {
  color: #f56c6c;
}

.log-panel-build-step-title {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  font-weight: 600;
}

.log-panel-build-step-duration {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: #888;
}

.log-panel-build-step-loading {
  flex-shrink: 0;
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid #555;
  border-top-color: #7ec8ff;
  border-radius: 50%;
  animation: log-spin 0.8s linear infinite;
}

.log-panel-build-step-arrow {
  flex-shrink: 0;
  width: 0.875rem;
  height: 0.875rem;
  transition: transform 0.2s ease;
}

.log-panel-build-step-arrow--expanded {
  transform: rotate(180deg);
}

.log-panel-build-step-message {
  margin: 0.25rem 0 0 1.375rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: #999;
}

.log-panel-build-step-detail {
  margin: 0.375rem 0 0 1.375rem;
  padding: 0.5rem 0.625rem;
  border-left: 2px solid #444;
  background-color: #111;
  color: #9cdcfe;
  font-size: 0.75rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-panel-build-log-section {
  padding: 0.5rem 0.75rem 0.625rem;
}

.log-panel-build-log-label {
  margin-bottom: 0.375rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #888;
}

.log-panel-build-content {
  margin: 0;
  padding: 0;
  overflow: visible;
  max-height: none;
  color: #ccc;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

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
