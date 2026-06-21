import { ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { removeToken } from '@/ajax'

/**
 * 退出登录相关逻辑
 */
export function useLogout() {
  const router = useRouter()

  /**
   * 执行退出登录：删除 token 并跳转登录页
   */
  async function logout() {
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
