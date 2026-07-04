import { ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { getRefreshToken, removeToken } from '@/ajax'
import { logoutUser } from '@/http/user'

/**
 * 退出登录相关逻辑
 */
export function useLogout() {
  const router = useRouter()

  /**
   * 执行退出登录：吊销 Refresh Token、清除本地凭证并跳转登录页
   */
  async function logout() {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        await logoutUser(refreshToken)
      } catch {
        // 登出接口失败仍清除本地凭证
      }
    }
    removeToken()
    await router.replace('/login')
  }

  /**
   * 确认后退出登录
   */
  async function confirmLogout() {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '退出',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await logout()
    } catch {
      // 用户取消
    }
  }

  return {
    logout,
    confirmLogout,
  }
}
