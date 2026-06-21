import { getToken } from '@/ajax'
import { createRouter, createWebHistory } from 'vue-router'

/** 无需登录即可访问的路由 */
const PUBLIC_PATHS = new Set(['/login', '/register'])

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: () => import('@/login/index.vue') },
    { path: '/register', component: () => import('@/login/index.vue') },
    { path: '/', component: () => import('@/home/index.vue') },
    { path: '/builder', component: () => import('@/builder/index.vue') },
    { path: '/agent', component: () => import('@/agent/index.vue') },
    { path: '/mine', component: () => import('@/mine/index.vue') },
  ],
})

/** 路由守卫：未登录跳转登录页 */
router.beforeEach((to) => {
  const token = getToken()

  if (PUBLIC_PATHS.has(to.path)) {
    return token ? { path: '/' } : true
  }

  if (!token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  return true
})

export default router
