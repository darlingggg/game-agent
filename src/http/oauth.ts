import axios from '@/ajax'

export type OAuthProvider = 'qq' | 'wechat'
export type OAuthFlowMode = 'login' | 'bind'
export type OAuthStatus = 'loading' | 'waiting' | 'processing' | 'success' | 'error' | 'expired' | 'reconnecting'

export interface OAuthLoginResult {
  id: string | number
  account: string
  nickname: string
  accessToken: string
  refreshToken: string
}

export interface OAuthSession {
  authorizeUrl: string
  eventsUrl: string
  expiresAt: string
}

export interface OAuthSseMessage {
  event: 'waiting_scan' | 'scan_complete' | 'login_success' | 'login_error' | 'auth_expired'
  data: {
    provider: OAuthProvider
    status: 'waiting' | 'processing' | 'success' | 'error' | 'expired'
    message: string
    result?: OAuthLoginResult
  }
}

/** 创建第三方登录或绑定会话。 */
export function createOAuthSession(provider: OAuthProvider, mode: OAuthFlowMode): Promise<OAuthSession> {
  const action = mode === 'bind' ? 'bind' : 'url'
  return axios.get(`/auth/${provider}/${action}`)
}

/** 将后端返回的 SSE 相对路径挂到与普通 API 相同的 baseURL 下。 */
export function resolveOAuthEventsUrl(eventsUrl: string): string {
  if (/^https?:\/\//i.test(eventsUrl)) return eventsUrl

  const apiBase = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  const path = eventsUrl.startsWith('/') ? eventsUrl : `/${eventsUrl}`

  if (/^https?:\/\//i.test(apiBase)) {
    return `${apiBase}${path}`
  }

  return new URL(`${apiBase}${path}`, window.location.origin).toString()
}
