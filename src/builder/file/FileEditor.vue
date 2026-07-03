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
  /** 是否只读（仅查看，不可编辑） */
  readOnly?: boolean
}>()

/** 编辑器内容，双向绑定 */
const editorContent = defineModel<string>({ required: true })

/** 当前文件对应的语法高亮语言 */
const language = computed(() => getMonacoLanguage(props.filePath))

/** Monaco 编辑器字体，可按需修改 */
const EDITOR_FONT_FAMILY = "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace"

/** Monaco 编辑器字号 */
const EDITOR_FONT_SIZE = 13

/** Monaco 编辑器基础配置 */
const BASE_EDITOR_OPTIONS = {
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

/** Monaco 编辑器配置（只读时禁止编辑） */
const editorOptions = computed(() => ({
  ...BASE_EDITOR_OPTIONS,
  readOnly: props.readOnly ?? false,
}))
</script>

<template>
  <div class="file-editor-wrap">
    <div v-if="readOnly" class="file-editor-readonly-bar">当前文件只能查看，不允许编辑</div>
    <VueMonacoEditor :key="filePath" v-model:value="editorContent" class="file-editor" theme="vs-dark" :language="language" :options="editorOptions" />
  </div>
</template>

<style scoped>
.file-editor-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.file-editor-readonly-bar {
  flex-shrink: 0;
  padding: 0.375rem 1rem;
  background: rgba(255, 193, 94, 0.14);
  border-bottom: 1px solid rgba(255, 193, 94, 0.35);
  color: #ffc15e;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
}

.file-editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  background-color: #1e1e1e;
}
</style>
