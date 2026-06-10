import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: () => import('@/home/index.vue') },
    { path: '/agent', component: () => import('@/agent/index.vue') },
    { path: '/mine', component: () => import('@/mine/index.vue') },
  ],
})

export default router
