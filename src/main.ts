import { createApp } from 'vue'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import { setupMonacoEditor } from './builder/file/monacoSetup.ts'
import router from './router'
import { pinia } from './stores'
import './styles/index.css'
import { applyThemeMode, getStoredThemeMode, initTheme } from './utils/theme'

/** 挂载前应用已保存主题，避免闪烁 */
applyThemeMode(getStoredThemeMode())

setupMonacoEditor()

// 设置rem
function setRem() {
  const deviceWidth = document.documentElement.clientWidth
  const deviceHeight = document.documentElement.clientHeight
  if (deviceWidth > deviceHeight) document.documentElement.style.fontSize = deviceWidth / 100 + 'px'
  else document.documentElement.style.fontSize = deviceHeight / 100 + 'px'
}

const app = createApp(App)
app.use(pinia)
app.use(router)
initTheme()
setRem()
app.mount('#app')
window.addEventListener('resize', setRem)
