<script setup lang="ts">
import { computed, ref } from 'vue'
import ConfigSettings from './ConfigSettings.vue'
import MaterialPanel from './MaterialPanel.vue'

defineOptions({
  name: 'ConfigPanel',
})

/** 配置内部 Tab 类型 */
type ConfigInnerTab = 'settings' | 'material'

/** 内部 Tab 配置 */
const CONFIG_INNER_TABS: { key: ConfigInnerTab; label: string }[] = [
  { key: 'settings', label: '项目配置' },
  { key: 'material', label: '项目素材' },
]

/** 当前内部 Tab */
const activeInnerTab = ref<ConfigInnerTab>('settings')

/** 已挂载过的内部面板（首次访问后保持挂载） */
const mountedInnerTabs = ref<Set<ConfigInnerTab>>(new Set(['settings']))

/**
 * 切换内部 Tab
 * @param key 目标 Tab
 */
function switchInnerTab(key: ConfigInnerTab) {
  if (key === activeInnerTab.value) return
  mountedInnerTabs.value = new Set([...mountedInnerTabs.value, key])
  activeInnerTab.value = key
}

/** 是否应挂载素材面板 */
const shouldMountMaterial = computed(() => mountedInnerTabs.value.has('material'))
</script>

<template>
  <div class="config-panel">
    <header class="config-panel-header">
      <h1 class="config-panel-title">配置</h1>
    </header>

    <div class="config-panel-type-tabs">
      <button
        v-for="tab in CONFIG_INNER_TABS"
        :key="tab.key"
        type="button"
        class="config-panel-type-tab"
        :class="{ 'config-panel-type-tab--active': activeInnerTab === tab.key }"
        @click="switchInnerTab(tab.key)"
      >
        <span class="config-panel-type-tab-label">{{ tab.label }}</span>
      </button>
    </div>

    <div class="config-panel-body">
      <ConfigSettings v-show="activeInnerTab === 'settings'" />
      <MaterialPanel v-if="shouldMountMaterial" v-show="activeInnerTab === 'material'" />
    </div>
  </div>
</template>

<style scoped>
/* 浅色主题：与模板/快照面板一致的克制风格 */
.config-panel {
  --config-accent-bg: #eef4ff;
  --config-accent-bg-hover: #dbe8ff;
  --config-accent-text: #1e4fa8;
  --config-accent-text-muted: #5b7fc7;
  --config-accent-border: #c7daff;
  --config-accent-border-hover: #a3c4ff;
  --config-group-border: var(--app-border);
  --config-radius-sm: 2px;
  --config-radius-md: 4px;

  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* 深色主题 */
html.dark .config-panel {
  --config-accent-bg: #1a2744;
  --config-accent-bg-hover: #223358;
  --config-accent-text: #9ec0ff;
  --config-accent-text-muted: #7a9fd4;
  --config-accent-border: #2d4470;
  --config-accent-border-hover: #3d5a8c;
  --config-group-border: var(--app-border);
}

.config-panel::-webkit-scrollbar {
  display: none;
}

.config-panel-header {
  margin-bottom: 0.75rem;
}

.config-panel-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
  line-height: 1.2;
}

.config-panel-type-tabs {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.config-panel-type-tab {
  display: inline-flex;
  align-items: center;
  height: 1.875rem;
  padding: 0 0.75rem;
  border: 1px solid var(--config-group-border);
  border-radius: var(--config-radius-md);
  background: var(--app-bg-subtle);
  color: var(--app-text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.config-panel-type-tab:hover {
  border-color: var(--config-accent-border);
  color: var(--config-accent-text);
}

.config-panel-type-tab--active {
  border-color: var(--config-accent-border);
  background: var(--config-accent-bg);
  color: var(--config-accent-text);
}

.config-panel-type-tab-label {
  line-height: 1;
}

.config-panel-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
}
</style>
