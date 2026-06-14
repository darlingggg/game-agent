import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 登录 token 本地存储键名（与历史版本保持一致） */
export const TOKEN_KEY = 'token'

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

    /** 清除 token */
    function clearToken() {
      token.value = ''
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
      pick: ['token'],
      serializer: {
        /** 与历史版本一致，仅存储 token 字符串 */
        serialize: (state) => (state as { token: string }).token,
        deserialize: (data) => {
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
