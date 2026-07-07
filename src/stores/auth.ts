import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 登录凭证本地存储键名（与历史版本保持一致） */
export const TOKEN_KEY = 'token'

/** 认证状态结构 */
interface AuthPersistState {
  /** Access Token（短期 JWT） */
  token: string
  /** Refresh Token（长期刷新凭证） */
  refreshToken: string
}

/** token 持久化存储：空值时删除键，而非写入空字符串 */
const tokenStorage = {
  getItem(key: string) {
    return localStorage.getItem(key)
  },
  setItem(key: string, value: string) {
    if (!value) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, value)
  },
}

/** 认证 Store，双 Token 持久化到 localStorage */
export const useAuthStore = defineStore(
  'auth',
  () => {
    /** Access Token（短期 JWT，请求头携带） */
    const token = ref('')

    /** Refresh Token（长期凭证，用于刷新 Access Token） */
    const refreshToken = ref('')

    /**
     * 仅更新 Access Token（刷新场景）
     * @param value Access Token
     */
    function setToken(value: string) {
      token.value = value
    }

    /**
     * 保存双 Token
     * @param accessToken Access Token
     * @param refresh Access Token 对应的 Refresh Token
     */
    function setTokens(accessToken: string, refresh: string) {
      token.value = accessToken
      refreshToken.value = refresh
    }

    /** 清除双 Token（内存与 localStorage 均移除） */
    function clearToken() {
      token.value = ''
      refreshToken.value = ''
      localStorage.removeItem(TOKEN_KEY)
    }

    return {
      token,
      refreshToken,
      setToken,
      setTokens,
      clearToken,
    }
  },
  {
    persist: {
      key: TOKEN_KEY,
      storage: tokenStorage,
      pick: ['token', 'refreshToken'],
      serializer: {
        /** 序列化为 JSON，同时存储 accessToken 与 refreshToken */
        serialize: (state) =>
          JSON.stringify({
            token: (state as AuthPersistState).token,
            refreshToken: (state as AuthPersistState).refreshToken,
          }),
        deserialize: (data) => {
          if (!data) {
            return { token: '', refreshToken: '' }
          }
          try {
            const parsed = JSON.parse(data) as Partial<AuthPersistState>
            if (typeof parsed === 'object' && parsed !== null) {
              return {
                token: typeof parsed.token === 'string' ? parsed.token : '',
                refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
              }
            }
          } catch {
            // 兼容历史纯字符串格式（仅 Access Token）
          }
          return { token: data, refreshToken: '' }
        },
      },
    },
  },
)
