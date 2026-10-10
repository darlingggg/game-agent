<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { renderMarkdown } from './markdownRenderer'
import { getImageGenerationTasks } from '@/http/imageGeneration'

defineOptions({
  name: 'MarkdownContent',
})

const props = defineProps<{
  /** Markdown 原文 */
  content: string
  assistantSessionId?: number
}>()

/** 渲染后的安全 HTML */
const imageOverrides = ref<Record<string, string>>({})
const html = computed(() => renderMarkdown(props.content, imageOverrides.value))
const previewUrl = ref('')
const failedSources = new Set<string>()
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
function imageIdentity(source: string) {
  try {
    const url = new URL(source, window.location.href)
    return url.origin + url.pathname
  } catch {
    return source
  }
}
async function refreshSignedImage(source: string) {
  if (!props.assistantSessionId || !source.includes('q-sign-')) return source
  const original = Object.keys(imageOverrides.value).find((key) => imageIdentity(key) === imageIdentity(source)) || source
  const cached = imageOverrides.value[original]
  if (cached) {
    const expiry = Number(new URL(cached, window.location.href).searchParams.get('q-sign-time')?.split(';')[1])
    if (!expiry || expiry > Date.now() / 1000 + 30) return cached
  }
  try {
    let page = 1
    let hasMore
    do {
      const result = await getImageGenerationTasks({ assistantSessionId: props.assistantSessionId, page, pageSize: 50 })
      const task = result.list.find((item) => item.url && imageIdentity(item.url) === imageIdentity(source))
      if (task?.url) {
        if (!disposed) imageOverrides.value[original] = task.url
        return task.url
      }
      hasMore = result.pagination.hasMore
      page += 1
    } while (hasMore && !disposed)
  } catch {
    /* 保留原链接，工具详情和图片资产仍可打开。 */
  }
  return source
}
async function handleImageClick(event: MouseEvent) {
  const imageLink = (event.target as Element)?.closest<HTMLAnchorElement>('.markdown-image-attachment[data-image-src]')
  if (!imageLink) return
  event.preventDefault()
  const source = await refreshSignedImage(imageLink.dataset.imageSrc || '')
  if (!disposed) previewUrl.value = source
}
function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement
  if (target.tagName !== 'IMG') return
  const source = target.closest<HTMLElement>('[data-image-src]')?.dataset.imageSrc
  if (!source || failedSources.has(source)) return
  failedSources.add(source)
  target.classList.add('is-error')
  void refreshSignedImage(source)
}
</script>

<template>
  <div class="markdown-content" @click="handleImageClick" @error.capture="handleImageError" v-html="html" />
  <el-image-viewer v-if="previewUrl" :url-list="[previewUrl]" crossorigin="anonymous" teleported hide-on-click-modal @close="previewUrl = ''" />
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
  padding: 0.1em 0.35em;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  font-size: 0.8125rem;
  font-family: var(--brand-font-mono);
  background-color: color-mix(in srgb, var(--app-text-primary) 6%, var(--app-surface));
  color: var(--app-text-primary);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  overflow-wrap: anywhere;
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
.markdown-content :deep(.markdown-image-attachment) {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: 100%;
  margin: 5px 0;
  padding: 6px 9px 6px 6px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
  background: var(--app-surface);
  font-size: 12px;
  vertical-align: middle;
  overflow-wrap: anywhere;
}
.markdown-content :deep(.markdown-image-thumb) {
  width: 40px;
  height: 40px;
  max-width: 40px;
  flex-shrink: 0;
  object-fit: contain;
  border-radius: 5px;
}
.markdown-content :deep(.markdown-image-thumb.is-error) {
  visibility: hidden;
}
</style>
