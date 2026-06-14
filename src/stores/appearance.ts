import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  DEFAULT_APPEARANCE_CONFIG,
  getEffectiveBackgroundColor,
  type AppearanceConfig,
  type ThemeMode,
} from '@/builder/config/appearanceConfig'

/** 外观配置 Store，持久化到 localStorage */
export const useAppearanceStore = defineStore(
  'appearance',
  () => {
    /** 默认主题 */
    const theme = ref<ThemeMode>(DEFAULT_APPEARANCE_CONFIG.theme)

    /** 自定义背景色，空字符串表示使用主题默认 */
    const backgroundColor = ref(DEFAULT_APPEARANCE_CONFIG.backgroundColor)

    /** 当前外观配置快照 */
    const config = computed<AppearanceConfig>(() => ({
      theme: theme.value,
      backgroundColor: backgroundColor.value,
    }))

    /** 实际生效的背景色 */
    const effectiveBackgroundColor = computed(() => getEffectiveBackgroundColor(config.value))

    /** 供后续 prompt 使用的完整外观配置 */
    const promptConfig = computed(() => ({
      ...config.value,
      effectiveBackgroundColor: effectiveBackgroundColor.value,
    }))

    /**
     * 批量更新外观配置
     * @param value 外观配置
     */
    function setAppearance(value: AppearanceConfig) {
      theme.value = value.theme === 'dark' ? 'dark' : 'light'
      backgroundColor.value = value.backgroundColor
    }

    /**
     * 设置主题
     * @param value 主题模式
     */
    function setTheme(value: ThemeMode) {
      theme.value = value
    }

    /**
     * 设置背景色
     * @param value 背景色，空字符串表示使用主题默认
     */
    function setBackgroundColor(value: string) {
      backgroundColor.value = value
    }

    return {
      theme,
      backgroundColor,
      config,
      effectiveBackgroundColor,
      promptConfig,
      setAppearance,
      setTheme,
      setBackgroundColor,
    }
  },
  {
    persist: {
      key: 'project-appearance-config',
      pick: ['theme', 'backgroundColor'],
    },
  },
)
