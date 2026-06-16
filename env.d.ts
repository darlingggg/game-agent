/// <reference types="vite/client" />

import type { Environment } from 'monaco-editor/esm/vs/editor/editor.api'

declare global {
  /** Monaco Editor Worker 运行环境配置 */

  var MonacoEnvironment: Environment | undefined
}

export {}
