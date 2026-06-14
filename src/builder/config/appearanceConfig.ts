import { pinia } from '@/stores'
import { useAppearanceStore } from '@/stores/appearance'

/** 主题模式 */
export type ThemeMode = 'light' | 'dark'

/** 外观配置，仅用于后续 prompt，不写入项目文件 */
export interface AppearanceConfig {
  /** 默认主题 */
  theme: ThemeMode
  /** 自定义背景色，空字符串表示使用当前主题默认背景 */
  backgroundColor: string
}

/** 默认外观配置 */
export const DEFAULT_APPEARANCE_CONFIG: AppearanceConfig = {
  theme: 'light',
  backgroundColor: '',
}

/** 各主题下的默认背景色 */
export const THEME_DEFAULT_BACKGROUND: Record<ThemeMode, string> = {
  light: '#ffffff',
  dark: '#1e1e1e',
}

/**
 * 获取实际生效的背景色
 * @param config 外观配置
 */
export function getEffectiveBackgroundColor(config: AppearanceConfig): string {
  return config.backgroundColor || THEME_DEFAULT_BACKGROUND[config.theme]
}

/**
 * 获取供后续 prompt 使用的外观配置
 */
export function getAppearanceConfigForPrompt(): AppearanceConfig & { effectiveBackgroundColor: string } {
  return useAppearanceStore(pinia).promptConfig
}
