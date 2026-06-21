import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { pinia } from '@/stores'
import { TOKEN_KEY, useAuthStore } from '@/stores/auth'

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
 * 获取本地 token
 */
export function getToken(): string {
  return useAuthStore(pinia).token
}

/**
 * 保存 token 到本地
 * @param token 登录凭证
 */
export function setToken(token: string): void {
  useAuthStore(pinia).setToken(token)
}

/**
 * 删除本地 token
 */
export function removeToken(): void {
  useAuthStore(pinia).clearToken()
  localStorage.removeItem(TOKEN_KEY)
}

export { TOKEN_KEY }

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
    const payload = response.data

    // 外层 code 格式：{ code, message, data }
    if (isApiResponse(payload)) {
      if (SUCCESS_CODES.includes(payload.code)) {
        const data = payload.data

        // 兼容 { code, data: { status, message, data? } } 双层结构
        if (isStatusApiResponse(data)) {
          if (SUCCESS_CODES.includes(data.status)) {
            return data.data
          }
          ElMessage.error(data.message || '请求失败')
          return Promise.reject(new Error(data.message || '请求失败'))
        }

        return data
      }

      ElMessage.error(payload.message || '请求失败')
      return Promise.reject(new Error(payload.message || '请求失败'))
    }

    // 直接 status 格式：{ status, message, data? }
    if (isStatusApiResponse(payload)) {
      if (SUCCESS_CODES.includes(payload.status)) {
        return payload.data
      }
      ElMessage.error(payload.message || '请求失败')
      return Promise.reject(new Error(payload.message || '请求失败'))
    }

    // 非统一格式响应（如文件流）直接返回原始数据
    return payload
  },
  (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status
    const message = error.response?.data?.message || error.message || '网络异常，请稍后重试'

    // 登录失效时删除本地 token
    if (status === 401) {
      removeToken()
    }

    ElMessage.error(message)
    return Promise.reject(new Error(message))
  },
)

export default instance
