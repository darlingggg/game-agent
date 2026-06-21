/** Cross-Origin Isolation 所需的 HTTP 响应头 */
export const CROSS_ORIGIN_ISOLATION_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin',
} as const

/** 未启用 Cross-Origin Isolation 时的提示文案 */
export const CROSS_ORIGIN_ISOLATION_ERROR =
  '当前页面未处于 Cross-Origin Isolated 环境，WebContainer 与 Monaco Editor 无法正常工作。' +
  '本地请使用 pnpm dev 或 pnpm preview 访问；生产环境需在 Web 服务器配置 COOP/COEP 响应头。'

/**
 * 检测当前页面是否处于 Cross-Origin Isolated 环境
 */
export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
}

/**
 * 校验 Cross-Origin Isolation，不满足时抛出可读错误
 */
export function assertCrossOriginIsolated(): void {
  if (!isCrossOriginIsolated()) {
    throw new Error(CROSS_ORIGIN_ISOLATION_ERROR)
  }
}
