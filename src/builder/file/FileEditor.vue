<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { computed } from 'vue'
import { getMonacoLanguage } from './fileLanguage'

defineOptions({
  name: 'FileEditor',
})

const props = defineProps<{
  /** 当前编辑文件路径 */
  filePath: string
}>()

/** 编辑器内容，双向绑定 */
const editorContent = defineModel<string>({ required: true })

/** 当前文件对应的语法高亮语言 */
const language = computed(() => getMonacoLanguage(props.filePath))

/** Monaco 编辑器字体，可按需修改 */
const EDITOR_FONT_FAMILY = "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace"

/** Monaco 编辑器字号 */
const EDITOR_FONT_SIZE = 13

/** Monaco 编辑器配置 */
const editorOptions = {
  automaticLayout: true,
  fontFamily: EDITOR_FONT_FAMILY,
  fontSize: EDITOR_FONT_SIZE,
  lineHeight: 22,
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
  renderWhitespace: 'selection' as const,
  formatOnPaste: true,
  smoothScrolling: true,
  padding: { top: 12, bottom: 12 },
  // 关闭所有代码提示，仅保留用户手动输入
  quickSuggestions: false,
  wordBasedSuggestions: 'off' as const,
  suggestOnTriggerCharacters: false,
  snippetSuggestions: 'none' as const,
  tabCompletion: 'off' as const,
  acceptSuggestionOnEnter: 'off' as const,
  parameterHints: { enabled: false },
  inlineSuggest: { enabled: false },
}
</script>

<template>
  <VueMonacoEditor
    :key="filePath"
    v-model:value="editorContent"
    class="file-editor"
    theme="vs-dark"
    :language="language"
    :options="editorOptions"
  />
</template>

<style scoped>
.file-editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  background-color: #1e1e1e;
}
</style>
