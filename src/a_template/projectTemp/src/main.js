import { createApp } from 'vue'
import App from './App.vue'
import '../styles/index.css'
// Vant 函数式 API 样式（Toast/Dialog/Notify/ImagePreview 无法被 VantResolver 自动引入）
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import 'vant/es/notify/style'
import 'vant/es/image-preview/style'

createApp(App).mount('#app')
