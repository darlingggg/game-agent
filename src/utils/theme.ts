import { pinia } from '@/stores'
import { THEME_STORAGE_KEY, useThemeStore, type AppThemeMode } from '@/stores/theme'

/** Element Plus 暗色主题使用的 html 类名 */
const DARK_CLASS = 'dark'

/**
 * 从本地存储读取主题，用于应用启动前避免闪烁
 */
export function getStoredThemeMode(): AppThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return 'light'

    const parsed = JSON.parse(raw) as { mode?: AppThemeMode }
    return parsed.mode === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/**
 * 将主题同步到 document，供 CSS 变量与 Element Plus 暗色样式使用
 * @param mode 主题模式
 */
export function applyThemeMode(mode: AppThemeMode) {
  const root = document.documentElement
  root.dataset.theme = mode
  root.classList.toggle(DARK_CLASS, mode === 'dark')
}

/**
 * 初始化主题：优先读 store，启动前则读 localStorage
 */
export function initTheme() {
  try {
    const themeStore = useThemeStore(pinia)
    applyThemeMode(themeStore.mode)
    return
  } catch {
    applyThemeMode(getStoredThemeMode())
  }
}
