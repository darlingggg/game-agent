<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, type ComponentPublicInstance } from 'vue'
import ChatPanel from './chat/ChatPanel.vue'
import ConfigPanel from './config/ConfigPanel.vue'
import FilePanel from './file/FilePanel.vue'
import LogPanel from './log/LogPanel.vue'
import PreviewPanel from './preview/PreviewPanel.vue'

defineOptions({
  name: 'HomeIndex',
})

interface TabItem {
  key: string
  label: string
}

const tabs: TabItem[] = [
  { key: 'chat', label: '对话' },
  { key: 'file', label: '文件' },
  { key: 'config', label: '配置' },
  { key: 'log', label: '日志' },
]

/** 当前选中的 Tab 索引 */
const activeTab = ref(0)

/** Tab 元素引用，用于计算底部指示条位置 */
const tabRefs = ref<HTMLElement[]>([])

/** 底部指示条样式 */
const indicatorStyle = ref({
  width: '0px',
  transform: 'translateX(0px)',
})

/**
 * 收集 Tab 元素引用
 * @param el Tab DOM 元素
 * @param index Tab 索引
 */
function setTabRef(el: Element | ComponentPublicInstance | null, index: number) {
  if (el instanceof HTMLElement) {
    tabRefs.value[index] = el
  }
}

/** 更新底部指示条位置与宽度 */
function updateIndicator() {
  const el = tabRefs.value[activeTab.value]
  if (!el) return

  indicatorStyle.value = {
    width: `${el.offsetWidth}px`,
    transform: `translateX(${el.offsetLeft}px)`,
  }
}

/**
 * 切换 Tab
 * @param index 目标 Tab 索引
 */
function switchTab(index: number) {
  activeTab.value = index
  nextTick(updateIndicator)
}

/** 当前选中 Tab 的内容标识 */
const activeTabKey = computed(() => tabs[activeTab.value]?.key ?? 'chat')

onMounted(() => {
  nextTick(updateIndicator)
  window.addEventListener('resize', updateIndicator)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateIndicator)
})
</script>

<template>
  <div class="container">
    <section class="left">left</section>
    <main class="main">
      <div class="main-tab">
        <div
          v-for="(tab, index) in tabs"
          :key="tab.key"
          :ref="(el) => setTabRef(el, index)"
          class="main-tab-item"
          :class="{ 'main-tab-item--active': activeTab === index }"
          @click="switchTab(index)"
        >
          {{ tab.label }}
        </div>
        <div class="main-tab-indicator" :style="indicatorStyle" />
      </div>
      <div class="main-content">
        <ChatPanel v-if="activeTabKey === 'chat'" class="main-content-panel" />
        <FilePanel v-else-if="activeTabKey === 'file'" class="main-content-panel" />
        <ConfigPanel v-else-if="activeTabKey === 'config'" class="main-content-panel" />
        <LogPanel v-else class="main-content-panel" />
      </div>
    </main>
    <section class="right">
      <PreviewPanel />
    </section>
  </div>
</template>

<style>
.container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  display: flex;
  padding: 0 1rem;
}
.left {
  flex: 1;
  height: 100%;
  background-color: #fbfcff;
  border-right: 1px solid #e5e5e5;
}
.main {
  flex: 3;
  height: 100%;
  background-color: #fff;
  display: flex;
  flex-direction: column;
}
.main-tab {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: start;
  gap: 1rem;
  align-items: center;
  padding: 0 1rem;
  border-bottom: 1px solid #e5e5e5;
}

.main-tab-item {
  font-size: 1rem;
  padding: 0.5rem 2rem;
  color: #000;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.2s ease;
}

.main-tab-item--active {
  color: #2463dc;
}

.main-tab-indicator {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background-color: #2463dc;
  transition:
    transform 0.25s ease,
    width 0.25s ease;
}

.main-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.main-content-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.right {
  flex: 1.5;
  height: 100%;
  min-width: 0;
  border-left: 1px solid #e5e5e5;
}
</style>
