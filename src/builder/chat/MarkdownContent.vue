<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from './markdownRenderer'

defineOptions({
  name: 'MarkdownContent',
})

const props = defineProps<{
  /** Markdown 原文 */
  content: string
}>()

/** 渲染后的安全 HTML */
const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <div class="markdown-content" v-html="html" />
</template>

<style scoped>
.markdown-content {
  white-space: normal;
  word-break: break-word;
}

.markdown-content :deep(p) {
  margin: 0.375rem 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin: 0.625rem 0 0.375rem;
  font-weight: 600;
  line-height: 1.4;
}

.markdown-content :deep(h1) {
  font-size: 1.125rem;
}

.markdown-content :deep(h2) {
  font-size: 1rem;
}

.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  font-size: 0.875rem;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.375rem 0;
  padding-left: 1.25rem;
}

.markdown-content :deep(li) {
  margin: 0.125rem 0;
}

.markdown-content :deep(blockquote) {
  margin: 0.375rem 0;
  padding: 0.375rem 0.75rem;
  border-left: 3px solid var(--app-border-strong);
  color: var(--app-text-secondary);
  background-color: var(--app-bg-subtle);
  border-radius: 0 4px 4px 0;
}

.markdown-content :deep(code) {
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background-color: #f3f4f6;
  color: #1f2937;
}

.markdown-content :deep(pre) {
  margin: 0.5rem 0;
  padding: 0.75rem;
  border-radius: 6px;
  background-color: #1e1e1e;
  overflow-x: auto;
}

.markdown-content :deep(pre code) {
  padding: 0;
  border: none;
  background: none;
  color: #e5e7eb;
  font-size: 0.75rem;
  line-height: 1.5;
  text-decoration: none;
}

.markdown-content :deep(a) {
  color: var(--app-accent);
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(table) {
  margin: 0.5rem 0;
  border-collapse: collapse;
  width: 100%;
  font-size: 0.75rem;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--app-border);
}

.markdown-content :deep(th) {
  background-color: var(--app-bg-subtle);
  font-weight: 600;
}

.markdown-content :deep(hr) {
  margin: 0.625rem 0;
  border: none;
  border-top: 1px solid var(--app-border);
}

.markdown-content :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
</style>
