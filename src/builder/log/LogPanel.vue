<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { TERMINAL_HEADER_LINES, TERMINAL_PROMPT, TERMINAL_SAMPLE_LOGS } from './terminalLogs'

defineOptions({
  name: 'LogPanel',
})

/** 终端日志行 */
const logLines = ref<string[]>([...TERMINAL_HEADER_LINES, ...TERMINAL_SAMPLE_LOGS])
const logContent = ref<string[]>([])

/** 终端滚动容器 */
const terminalRef = ref<HTMLElement | null>(null)

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
 * 追加一条日志
 * @param line 日志内容
 */
function appendLog(line: string) {
  logContent.value.push(line)
  void scrollToBottom()
}

onMounted(() => {
  void scrollToBottom()
})

defineExpose({
  appendLog,
})
</script>

<template>
  <div ref="terminalRef" class="log-panel">
    <div v-for="(line, index) in logLines" :key="index" class="log-panel-line">
      {{ line }}
    </div>
    <div v-for="(line, index) in logContent" :key="index" class="log-panel-line">
      <span>{{ TERMINAL_PROMPT }}</span> {{ line }}
    </div>
    <!-- <div class="log-panel-line log-panel-prompt"> -->
    <!-- <span>{{ TERMINAL_PROMPT }}</span> -->
    <!-- <span class="log-panel-cursor" aria-hidden="true" /> -->
    <!-- </div> -->
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
}

.log-panel-line {
  min-height: 1.5em;
}

.log-panel-prompt {
  display: flex;
  align-items: center;
}

/* .log-panel-cursor {
  display: inline-block;
  width: 0.5rem;
  height: 1em;
  margin-left: 1px;
  background-color: #ccc;
  animation: log-cursor-blink 1s step-end infinite;
}

@keyframes log-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
} */
</style>
