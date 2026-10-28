import { createApp } from 'vue'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import { pinia } from './stores'
import './styles/index.css'
import { applyThemeMode, getStoredThemeMode, initTheme } from './utils/theme'

/** 挂载前应用已保存主题，避免闪烁 */
applyThemeMode(getStoredThemeMode())

// 设置rem
function setRem() {
  const deviceWidth = document.documentElement.clientWidth
  document.documentElement.style.fontSize = Math.max(16, deviceWidth / 100) + 'px'
}

const app = createApp(App)

/** 开发环境捕获渲染错误，避免静默白屏 */
if (import.meta.env.DEV) {
  app.config.errorHandler = (error, instance, info) => {
    console.error('[Vue Error]', info, error, instance?.$?.type?.name ?? instance?.$?.type)
  }
}

app.use(pinia)
app.use(router)
initTheme()
setRem()
app.mount('#app')
window.addEventListener('resize', setRem)
