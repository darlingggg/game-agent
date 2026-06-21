import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 登录 token 本地存储键名（与历史版本保持一致） */
export const TOKEN_KEY = 'token'

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

/** 认证 Store，token 持久化到 localStorage */
export const useAuthStore = defineStore(
  'auth',
  () => {
    /** 登录凭证 */
    const token = ref('')

    /**
     * 保存 token
     * @param value 登录凭证
     */
    function setToken(value: string) {
      token.value = value
    }

    /** 删除 token（内存与 localStorage 均移除） */
    function clearToken() {
      token.value = ''
      localStorage.removeItem(TOKEN_KEY)
    }

    return {
      token,
      setToken,
      clearToken,
    }
  },
  {
    persist: {
      key: TOKEN_KEY,
      storage: tokenStorage,
      pick: ['token'],
      serializer: {
        /** 与历史版本一致，仅存储 token 字符串 */
        serialize: (state) => (state as { token: string }).token,
        deserialize: (data) => {
          if (!data) {
            return { token: '' }
          }
          try {
            const parsed = JSON.parse(data) as { token?: string }
            if (typeof parsed?.token === 'string') {
              return { token: parsed.token }
            }
          } catch {
            // 兼容历史纯字符串格式
          }
          return { token: data }
        },
      },
    },
  },
)
