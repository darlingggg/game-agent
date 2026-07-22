import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置：Vue（Tailwind 由 postcss.config.js 的 @tailwindcss/postcss 处理）
export default defineConfig({
  plugins: [vue()],
})
