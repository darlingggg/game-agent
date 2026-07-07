import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import { pinia } from '@/stores'
import { TOKEN_KEY, useAuthStore } from '@/stores/auth'

/** 带重试标记的请求配置 */
interface RetryAxiosRequestConfig extends InternalAxiosRequestConfig {
  /** 是否已尝试过刷新 Token 后重试 */
  _retry?: boolean
}

/** 接口成功状态码 */
const SUCCESS_CODES = [0, 200]

/** 外层统一接口响应结构（code 字段） */
export interface ApiResponse<T = unknown> {
  /** 业务状态码，0 或 200 表示成功 */
  code: number
  /** 响应数据 */
  data: T
  /** 提示信息 */
  message: string
}

/** 内层业务响应结构（status 字段） */
export interface StatusApiResponse<T = unknown> {
  /** 业务状态码，0 或 200 表示成功 */
  status: number
  /** 提示信息 */
  message: string
  /** 响应数据（失败时可能不存在） */
  data?: T
}

/**
 * 获取本地 Access Token
 */
export function getToken(): string {
  return useAuthStore(pinia).token
}

/**
 * 获取本地 Refresh Token
 */
export function getRefreshToken(): string {
  return useAuthStore(pinia).refreshToken
}

/**
 * 是否已登录（有 Refresh Token 或 Access Token 即视为已登录）
 */
export function isLoggedIn(): boolean {
  const authStore = useAuthStore(pinia)
  return !!authStore.refreshToken || !!authStore.token
}

/**
 * 保存双 Token 到本地
 * @param accessToken Access Token
 * @param refreshToken Refresh Token
 */
export function setTokens(accessToken: string, refreshToken: string): void {
  useAuthStore(pinia).setTokens(accessToken, refreshToken)
}

/**
 * 仅更新 Access Token（刷新场景）
 * @param token Access Token
 */
export function setToken(token: string): void {
  useAuthStore(pinia).setToken(token)
}

/**
 * 删除本地双 Token
 */
export function removeToken(): void {
  useAuthStore(pinia).clearToken()
  localStorage.removeItem(TOKEN_KEY)
}

export { TOKEN_KEY }

/** 认证失效时的 HTTP / 业务状态码 */
const UNAUTHORIZED_CODES = [401, 403]

/** 业务 status/code 为 1 时不弹错误提示的接口路径（如尚未部署线上版本） */
const SILENT_BUSINESS_FAIL_PATHS = ['/project/version']

/** 可静默处理的业务失败码 */
const SILENT_BUSINESS_FAIL_CODE = 1

/** 是否正在跳转登录页，避免并发请求重复弹窗 */
let authRedirecting = false

/** 是否正在刷新 Access Token，避免并发重复刷新 */
let isRefreshing = false

/** 刷新期间挂起的请求，刷新成功后用新 Token 重试 */
let pendingRequests: Array<(token: string) => void> = []

/** 不参与 Token 刷新的接口路径 */
const SKIP_REFRESH_PATHS = ['/login', '/register', '/auth/refresh', '/auth/logout']

/** 无拦截器的原始 axios 实例，专用于刷新 Token */
const rawAxios = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
})

/**
 * 统一弹出接口错误提示（axios 拦截器与 fetch 请求共用）
 * @param message 错误文案
 */
export function showRequestError(message: string): void {
  ElMessage.error(message)
}

/**
 * 登录失效或未授权：清除 token 并强制跳转登录页
 * @param message 提示文案
 */
export function handleUnauthorized(message = '登录已失效，请重新登录'): void {
  if (authRedirecting) return

  const currentPath = router.currentRoute.value.fullPath
  const isOnAuthPage = currentPath.startsWith('/login') || currentPath.startsWith('/register')
  if (isOnAuthPage) {
    removeToken()
    return
  }

  authRedirecting = true
  removeToken()
  ElMessage.warning(message)

  void router
    .replace({
      path: '/login',
      query: currentPath !== '/' ? { redirect: currentPath } : undefined,
    })
    .finally(() => {
      window.setTimeout(() => {
        authRedirecting = false
      }, 1000)
    })
}

/**
 * 获取请求路径（不含 query）
 * @param config axios 请求配置
 */
function getRequestPath(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? ''
  if (url.startsWith('http')) {
    try {
      return new URL(url).pathname
    } catch {
      return url.split('?')[0] ?? url
    }
  }
  const path = url.split('?')[0] ?? url
  return path.startsWith('/') ? path : `/${path}`
}

/**
 * 是否为可静默处理的业务失败
 * @param config axios 请求配置
 * @param businessCode 业务状态码
 */
function isSilentBusinessFail(config: InternalAxiosRequestConfig, businessCode: number): boolean {
  if (businessCode !== SILENT_BUSINESS_FAIL_CODE) return false
  const path = getRequestPath(config)
  return SILENT_BUSINESS_FAIL_PATHS.some((item) => path.endsWith(item))
}

/**
 * 拒绝业务失败请求，按接口决定是否弹出错误提示
 * @param config axios 请求配置
 * @param businessCode 业务状态码
 * @param message 错误文案
 */
function rejectBusinessError(
  config: InternalAxiosRequestConfig,
  businessCode: number,
  message: string,
): Promise<never> {
  if (!isSilentBusinessFail(config, businessCode)) {
    showRequestError(message)
  }
  return Promise.reject(new Error(message))
}

/**
 * 判断业务状态码是否表示未授权
 * @param code 业务状态码
 */
function isUnauthorizedBusinessCode(code: number): boolean {
  return UNAUTHORIZED_CODES.includes(code)
}

/**
 * 判断是否为 code 格式的统一接口响应
 */
function isApiResponse(payload: unknown): payload is ApiResponse {
  return typeof payload === 'object' && payload !== null && 'code' in payload && 'data' in payload
}

/**
 * 判断是否为 status 格式的业务响应
 */
function isStatusApiResponse(payload: unknown): payload is StatusApiResponse {
  return typeof payload === 'object' && payload !== null && 'status' in payload && 'message' in payload
}

/**
 * 当前请求是否允许尝试刷新 Token
 * @param config axios 请求配置
 */
function shouldAttemptRefresh(config: InternalAxiosRequestConfig): boolean {
  const path = getRequestPath(config)
  return !SKIP_REFRESH_PATHS.some((item) => path.endsWith(item))
}

/**
 * 从刷新接口响应中解析 accessToken（兼容 code / status 两种后端格式）
 * @param payload 刷新接口原始响应体
 */
function parseRefreshResponse(payload: unknown): string {
  if (isApiResponse(payload) && SUCCESS_CODES.includes(payload.code)) {
    const accessToken = (payload.data as { accessToken?: string } | null)?.accessToken
    if (accessToken) return accessToken
  }

  if (isStatusApiResponse(payload) && SUCCESS_CODES.includes(payload.status)) {
    const accessToken = (payload.data as { accessToken?: string } | undefined)?.accessToken
    if (accessToken) return accessToken
  }

  const message = isApiResponse(payload) || isStatusApiResponse(payload)
    ? payload.message
    : undefined
  throw new Error(message || '刷新 Token 失败')
}

/**
 * 用 Refresh Token 换取新的 Access Token
 * @returns 新的 Access Token
 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error('Refresh Token 不存在')
  }

  const response = await rawAxios.post('/auth/refresh', { refreshToken })
  const accessToken = parseRefreshResponse(response.data)

  setToken(accessToken)
  return accessToken
}

/**
 * 尝试刷新 Access Token（供 fetch 流式请求等场景使用）
 * @returns 刷新成功返回新 Token，失败返回 null
 */
export async function tryRefreshToken(): Promise<string | null> {
  if (!getRefreshToken()) return null

  try {
    if (isRefreshing) {
      return await new Promise<string>((resolve, reject) => {
        pendingRequests.push((token) => resolve(token))
        window.setTimeout(() => reject(new Error('刷新 Token 超时')), 10000)
      })
    }

    isRefreshing = true
    const newToken = await refreshAccessToken()
    pendingRequests.forEach((callback) => callback(newToken))
    pendingRequests = []
    return newToken
  } catch {
    return null
  } finally {
    isRefreshing = false
  }
}

/**
 * Token 失效时尝试刷新并重试原请求
 * @param config 原请求配置
 */
async function retryWithRefreshedToken(config: RetryAxiosRequestConfig): Promise<unknown> {
  if (!shouldAttemptRefresh(config) || !getRefreshToken()) {
    handleUnauthorized()
    return Promise.reject(new Error('登录已失效'))
  }

  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      pendingRequests.push((token) => {
        config.headers.Authorization = `Bearer ${token}`
        resolve(instance(config))
      })
      window.setTimeout(() => reject(new Error('刷新 Token 超时')), 10000)
    })
  }

  config._retry = true
  isRefreshing = true

  try {
    const newToken = await refreshAccessToken()
    pendingRequests.forEach((callback) => callback(newToken))
    pendingRequests = []
    config.headers.Authorization = `Bearer ${newToken}`
    return instance(config)
  } catch (error) {
    pendingRequests = []
    const message = error instanceof Error ? error.message : '登录已失效，请重新登录'
    handleUnauthorized(message)
    return Promise.reject(new Error(message))
  } finally {
    isRefreshing = false
  }
}

/**
 * 带鉴权与自动刷新的 fetch 请求（供 SSE 等不走 axios 的场景使用）
 * @param url 请求地址
 * @param init fetch 配置
 */
export async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = (token: string) => {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...init, headers })
  }

  let response = await doFetch(getToken())

  if (response.status === 401 || response.status === 403) {
    const newToken = await tryRefreshToken()
    if (newToken) {
      response = await doFetch(newToken)
    } else {
      handleUnauthorized()
      throw new Error('登录已失效，请重新登录')
    }
  }

  return response
}

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
})

/** 请求拦截：自动携带 token */
instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

/** 响应拦截：统一处理业务状态码与错误 */
instance.interceptors.response.use(
  (response: AxiosResponse) => {
    const { config } = response
    const payload = response.data

    // 外层 code 格式：{ code, message, data }
    if (isApiResponse(payload)) {
      if (isUnauthorizedBusinessCode(payload.code)) {
        handleUnauthorized(payload.message || undefined)
        return Promise.reject(new Error(payload.message || '登录已失效'))
      }

      if (SUCCESS_CODES.includes(payload.code)) {
        const data = payload.data

        // 兼容 { code, data: { status, message, data? } } 双层结构
        if (isStatusApiResponse(data)) {
          if (isUnauthorizedBusinessCode(data.status)) {
            handleUnauthorized(data.message || undefined)
            return Promise.reject(new Error(data.message || '登录已失效'))
          }
          if (SUCCESS_CODES.includes(data.status)) {
            return data.data
          }
          return rejectBusinessError(config, data.status, data.message || '请求失败')
        }

        return data
      }

      return rejectBusinessError(config, payload.code, payload.message || '请求失败')
    }

    // 直接 status 格式：{ status, message, data? }
    if (isStatusApiResponse(payload)) {
      if (isUnauthorizedBusinessCode(payload.status)) {
        handleUnauthorized(payload.message || undefined)
        return Promise.reject(new Error(payload.message || '登录已失效'))
      }
      if (SUCCESS_CODES.includes(payload.status)) {
        return payload.data
      }
      return rejectBusinessError(config, payload.status, payload.message || '请求失败')
    }

    // 非统一格式响应（如文件流）直接返回原始数据
    return payload
  },
  async (error: AxiosError<ApiResponse>) => {
    const { config, response } = error
    const status = response?.status
    const message = response?.data?.message || error.message || '网络异常，请稍后重试'

    // Access Token 过期时尝试用 Refresh Token 静默刷新并重试
    if (
      status !== undefined
      && isUnauthorizedBusinessCode(status)
      && config
      && !(config as RetryAxiosRequestConfig)._retry
    ) {
      console.log('[auth] 刷新成功，重试原请求 config:', config)
      return retryWithRefreshedToken(config as RetryAxiosRequestConfig)
    }

    // 刷新失败或 Refresh Token 无效时跳转登录页
    if (status !== undefined && isUnauthorizedBusinessCode(status)) {
      handleUnauthorized(message)
      return Promise.reject(new Error(message))
    }

    showRequestError(message)
    return Promise.reject(new Error(message))
  },
)

export default instance
