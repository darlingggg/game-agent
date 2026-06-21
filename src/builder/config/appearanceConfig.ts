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

/** 传给对话接口的外观上下文 */
export interface ChatAppearanceContext {
  /** 默认主题，仅未设置自定义背景色时传递 */
  theme?: ThemeMode
  /** 自定义背景色，设置后不再传递默认主题 */
  backgroundColor?: string
}

/**
 * 获取实际生效的背景色
 * @param config 外观配置
 */
export function getEffectiveBackgroundColor(config: AppearanceConfig): string {
  return config.backgroundColor || THEME_DEFAULT_BACKGROUND[config.theme]
}

/**
 * 根据外观配置生成对话附带的外观上下文
 * 设置了背景色则只传背景色，否则传当前默认主题
 * @param config 外观配置
 */
export function getChatAppearanceContext(config: AppearanceConfig): ChatAppearanceContext {
  const bg = config.backgroundColor.trim()
  if (bg) {
    return { backgroundColor: bg }
  }
  return { theme: config.theme }
}

/**
 * 合并用户输入与外观配置构建完整 prompt，外观优先级低于用户内容
 * @param userInput 用户输入
 * @param config 外观配置
 */
export function buildChatPrompt(userInput: string, config: AppearanceConfig): string {
  const appearance = getChatAppearanceContext(config)
  const lines = [
    userInput,
    '',
    '---',
    '外观配置参考（优先级低于上述用户需求，仅在用户未明确指定时生效）：',
  ]

  if (appearance.backgroundColor) {
    lines.push(`背景色：${appearance.backgroundColor}`)
  } else if (appearance.theme) {
    lines.push(`默认主题：${appearance.theme === 'dark' ? '深色' : '浅色'}`)
  }

  return lines.join('\n')
}

/**
 * 获取供后续 prompt 使用的外观配置
 */
export function getAppearanceConfigForPrompt(): AppearanceConfig & { effectiveBackgroundColor: string } {
  return useAppearanceStore(pinia).promptConfig
}
