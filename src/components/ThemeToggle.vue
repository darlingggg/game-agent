<script setup lang="ts">
import { Moon, Sunny } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/theme'

defineOptions({
  name: 'ThemeToggle',
})

const themeStore = useThemeStore()
const { mode } = storeToRefs(themeStore)

/** 切换明暗主题 */
function handleToggle() {
  themeStore.toggleMode()
}
</script>

<template>
  <el-tooltip :content="mode === 'dark' ? '切换浅色主题' : '切换深色主题'" placement="bottom">
    <button type="button" class="theme-toggle" :aria-label="mode === 'dark' ? '切换浅色主题' : '切换深色主题'" @click="handleToggle">
      <el-icon v-if="mode === 'dark'" class="theme-toggle-icon">
        <Sunny />
      </el-icon>
      <el-icon v-else class="theme-toggle-icon">
        <Moon />
      </el-icon>
    </button>
  </el-tooltip>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background-color: var(--app-surface);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.theme-toggle:hover {
  color: var(--app-accent);
  border-color: var(--app-accent);
  background-color: var(--app-accent-soft);
}

.theme-toggle-icon {
  font-size: 20px;
}
</style>
