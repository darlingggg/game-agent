/** Monaco 初始化 Promise，保证全局只执行一次 */
let setupPromise: Promise<void> | null = null

/**
 * 懒加载并初始化 Monaco Editor 本地 Worker 环境
 * 可重复调用，实际只会初始化一次
 */
export function setupMonacoEditor(): Promise<void> {
  if (!setupPromise) {
    setupPromise = initMonacoEditor()
  }
  return setupPromise
}

/**
 * 动态导入 Monaco 相关模块并完成 Worker / loader 配置
 */
async function initMonacoEditor(): Promise<void> {
  const [
    { loader },
    monaco,
    { default: editorWorker },
    { default: cssWorker },
    { default: htmlWorker },
    { default: jsonWorker },
    { default: tsWorker },
  ] = await Promise.all([
    import('@guolao/vue-monaco-editor'),
    import('monaco-editor'),
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    import('monaco-editor/esm/vs/language/css/css.worker?worker'),
    import('monaco-editor/esm/vs/language/html/html.worker?worker'),
    import('monaco-editor/esm/vs/language/json/json.worker?worker'),
    import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
  ])

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') {
        return new jsonWorker()
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new cssWorker()
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker()
      }
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker()
      }
      return new editorWorker()
    },
  }

  loader.config({ monaco })
}
