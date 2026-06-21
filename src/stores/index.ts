import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

/** 全局 Pinia 实例，供非组件上下文（如 axios 拦截器）使用 */
export const pinia = createPinia()

pinia.use(piniaPluginPersistedstate)
