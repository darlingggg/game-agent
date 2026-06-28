import { defineAsyncComponent, defineComponent, h } from 'vue'

/** 面板异步加载占位 */
const PanelLoading = defineComponent({
  name: 'PanelLoading',
  setup() {
    return () => h('div', { class: 'builder-panel-loading' }, '加载中...')
  },
})

/**
 * 创建 Builder 面板异步组件（Vite 按路径自动拆包）
 * @param loader 动态 import 函数
 */
function createAsyncPanel(loader: () => Promise<{ default: unknown }>) {
  return defineAsyncComponent({
    loader,
    loadingComponent: PanelLoading,
    delay: 120,
  })
}

/** 对话面板 */
export const ChatPanel = createAsyncPanel(() => import('./chat/ChatPanel.vue'))

/** 文件面板 */
export const FilePanel = createAsyncPanel(() => import('./file/FilePanel.vue'))

/** 配置面板 */
export const ConfigPanel = createAsyncPanel(() => import('./config/ConfigPanel.vue'))

/** 版本快照面板 */
export const SnapshotPanel = createAsyncPanel(() => import('./snapshot/SnapshotPanel.vue'))

/** 日志面板 */
export const LogPanel = createAsyncPanel(() => import('./log/LogPanel.vue'))

/** 会话列表面板 */
export const SessionPanel = createAsyncPanel(() => import('./session/SessionPanel.vue'))

/** 预览面板 */
export const PreviewPanel = createAsyncPanel(() => import('./preview/PreviewPanel.vue'))
