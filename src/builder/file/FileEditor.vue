<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, type Component } from 'vue'
import { getMonacoLanguage } from './fileLanguage'
import { setupMonacoEditor } from './monacoSetup'

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

/** Monaco 是否已完成懒加载初始化 */
const editorReady = ref(false)

/** Monaco 初始化失败信息 */
const editorError = ref('')

/** 懒加载后的 VueMonacoEditor 组件 */
const VueMonacoEditor = shallowRef<Component | null>(null)

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

onMounted(async () => {
  try {
    await setupMonacoEditor()
    const mod = await import('@guolao/vue-monaco-editor')
    VueMonacoEditor.value = mod.VueMonacoEditor
    editorReady.value = true
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : '编辑器加载失败'
  }
})
</script>

<template>
  <div class="file-editor-wrap">
    <div v-if="readOnly" class="file-editor-readonly-bar">当前文件只能查看，不允许编辑</div>
    <div v-if="editorError" class="file-editor-status file-editor-status--error">{{ editorError }}</div>
    <div v-else-if="!editorReady" class="file-editor-status">编辑器加载中...</div>
    <component
      :is="VueMonacoEditor"
      v-else
      :key="filePath"
      v-model:value="editorContent"
      class="file-editor"
      theme="vs-dark"
      :language="language"
      :options="editorOptions"
    />
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

.file-editor-status {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.875rem;
  background-color: #1e1e1e;
}

.file-editor-status--error {
  color: #f87171;
}

.file-editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  background-color: #1e1e1e;
}
</style>
