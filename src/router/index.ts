import { isLoggedIn } from '@/ajax'
import { ElMessage } from 'element-plus'
import { createRouter, createWebHistory } from 'vue-router'

/** 无需登录即可访问的路由 */
const PUBLIC_PATHS = new Set(['/login', '/register'])
const ADMIN_ROLES = new Set(['super', 'admin'])

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: () => import('@/login/index.vue') },
    { path: '/register', component: () => import('@/login/index.vue') },
    { path: '/', component: () => import('@/home/index.vue') },
    { path: '/builder', component: () => import('@/builder/index.vue') },
    { path: '/agent', component: () => import('@/agent/index.vue') },
    { path: '/mine', component: () => import('@/mine/index.vue') },
    { path: '/admin', component: () => import('@/admin/index.vue'), meta: { requiresAdmin: true } },
    { path: '/:pathMatch(.*)*', component: () => import('@/404/index.vue') },
  ],
})

/** 路由守卫：未登录跳转登录页（以 Refresh Token 为准判断登录态） */
router.beforeEach(async (to, from) => {
  const loggedIn = isLoggedIn()

  if (PUBLIC_PATHS.has(to.path)) {
    return loggedIn ? { path: '/' } : true
  }

  if (!loggedIn) {
    if (to.meta.requiresAdmin) {
      ElMessage.warning('请先进行登录后进行查看')
    }
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin) {
    try {
      const { getUserInfo } = await import('@/http/user')
      const profile = await getUserInfo()
      if (!ADMIN_ROLES.has(profile.role)) {
        ElMessage.warning('无权限访问后台管理页面')

        const hasUsablePreviousPage = from.matched.length > 0 && !PUBLIC_PATHS.has(from.path) && !from.meta.requiresAdmin
        return hasUsablePreviousPage ? false : { path: '/', replace: true }
      }
    } catch {
      return false
    }
  }

  return true
})

export default router
