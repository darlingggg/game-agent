import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 应用主题模式 */
export type AppThemeMode = 'light' | 'dark'

/** 主题本地存储键名 */
export const THEME_STORAGE_KEY = 'app-theme-mode'

/** 应用主题 Store，持久化到 localStorage */
export const useThemeStore = defineStore(
  'theme',
  () => {
    /** 当前主题模式 */
    const mode = ref<AppThemeMode>('light')

    /**
     * 设置主题模式
     * @param value 主题模式
     */
    function setMode(value: AppThemeMode) {
      mode.value = value === 'dark' ? 'dark' : 'light'
    }

    /** 切换明暗主题 */
    function toggleMode() {
      setMode(mode.value === 'dark' ? 'light' : 'dark')
    }

    return {
      mode,
      setMode,
      toggleMode,
    }
  },
  {
    persist: {
      key: THEME_STORAGE_KEY,
      pick: ['mode'],
    },
  },
)
