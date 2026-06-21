/// <reference types="vite/client" />

/** Vite 环境变量类型声明 */
interface ImportMetaEnv {
  /** API 基础地址 */
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import type { Environment } from 'monaco-editor/esm/vs/editor/editor.api'

declare global {
  /** Monaco Editor Worker 运行环境配置 */

  var MonacoEnvironment: Environment | undefined
}

export {}
