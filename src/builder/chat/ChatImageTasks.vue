<script setup lang="ts">
import { computed } from 'vue'
import { Picture, Warning } from '@element-plus/icons-vue'
import type { ImageGenerationTask, ImageGenerationStatus } from '@/http/imageGeneration'

defineOptions({ name: 'ChatImageTasks' })

const props = defineProps<{ tasks: ImageGenerationTask[]; compact?: boolean }>()

const STATUS_LABELS: Record<ImageGenerationStatus, string> = {
  queued: '等待生成',
  submitted: '任务已提交',
  generating: '正在生成',
  storing: '正在保存图片',
  succeeded: '已生成',
  failed: '生成失败',
}

const previewUrls = computed(() => props.tasks.map((task) => task.url).filter((url): url is string => Boolean(url)))

function statusLabel(status: ImageGenerationStatus) {
  return STATUS_LABELS[status]
}

function formatBytes(value: number | null) {
  if (!value) return ''
  if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB'
  return (value / 1024 / 1024).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="chat-image-tasks" :class="{ 'chat-image-tasks--compact': compact }" aria-label="AI 生图任务">
    <article v-for="task in tasks" :key="task.taskId" class="chat-image-task">
      <div class="chat-image-task__preview">
        <el-image
          v-if="task.status === 'succeeded' && task.url"
          :src="task.url"
          :preview-src-list="previewUrls"
          fit="contain"
          crossorigin="anonymous"
          preview-teleported
          hide-on-click-modal
        />
        <div v-else-if="task.status === 'failed' || task.observationError" class="chat-image-task__state is-error">
          <el-icon>
            <Warning />
          </el-icon>
          <strong>{{ task.observationError ? '暂无法获取任务进度' : '图片生成失败' }}</strong>
          <span>{{ task.observationError || task.errorMessage || '服务暂时不可用，请稍后重试' }}</span>
        </div>
        <div v-else class="chat-image-task__state">
          <span class="chat-image-task__scanner" />
          <el-icon>
            <Picture />
          </el-icon>
          <strong>{{ statusLabel(task.status) }}</strong>
          <span>完成后可点击查看</span>
        </div>
      </div>
      <div class="chat-image-task__meta">
        <p>{{ task.prompt }}</p>
        <span>#{{ task.taskId }}</span>
        <span>{{ task.imageSize || 'auto' }}</span>
        <span v-if="task.width && task.height">{{ task.width }} x {{ task.height }}</span>
        <span v-if="task.storedSize">{{ formatBytes(task.storedSize) }}</span>
      </div>
    </article>
  </div>
</template>

<style scoped>
.chat-image-tasks--compact .chat-image-task {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  width: 100%;
  max-width: 100%;
}
.chat-image-tasks--compact .chat-image-task__preview {
  height: 120px;
  min-height: 0;
  max-height: 120px;
  aspect-ratio: auto;
}
.chat-image-tasks--compact .chat-image-task__scanner {
  display: none;
}
.chat-image-tasks--compact .chat-image-task__state {
  padding: 6px;
  gap: 4px;
}
.chat-image-tasks--compact .chat-image-task__state strong,
.chat-image-tasks--compact .chat-image-task__state span {
  font-size: 11px;
}
@media (max-width: 480px) {
  .chat-image-tasks--compact .chat-image-task {
    grid-template-columns: 100px minmax(0, 1fr);
  }
  .chat-image-tasks--compact .chat-image-task__preview {
    height: 100px;
  }
}
.chat-image-tasks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 20rem));
  gap: 0.75rem;
  width: 100%;
  margin: 0.625rem 0;
}

.chat-image-task {
  width: 100%;
  max-width: 20rem;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface);
}

.chat-image-task__preview {
  position: relative;
  height: min(13.75rem, 60vw);
  min-height: 10rem;
  overflow: hidden;
  background-color: var(--app-bg-subtle);
  background-image: linear-gradient(var(--app-border) 1px, transparent 1px), linear-gradient(90deg, var(--app-border) 1px, transparent 1px);
  background-size: 20px 20px;
}

.chat-image-task__preview :deep(.el-image) {
  width: 100%;
  height: 100%;
}

.chat-image-task__preview :deep(img) {
  display: block;
}

.chat-image-task__state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 1rem;
  color: var(--app-text-secondary);
  text-align: center;
}

.chat-image-task__state .el-icon {
  width: 1.75rem;
  height: 1.75rem;
  color: var(--app-accent);
  font-size: 1.75rem;
}

.chat-image-task__state strong {
  color: var(--app-text-primary);
  font-size: 0.8125rem;
}

.chat-image-task__state span {
  font-size: 0.75rem;
  line-height: 1.5;
}

.chat-image-task__state.is-error .el-icon,
.chat-image-task__state.is-error strong {
  color: #dc2626;
}

.chat-image-task__scanner {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #22c55e, #3b82f6, transparent);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.55);
  animation: image-task-scan 2.4s ease-in-out infinite;
}

.chat-image-task__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 0.625rem;
  padding: 0.625rem 0.75rem 0.75rem;
}

.chat-image-task__meta p {
  flex-basis: 100%;
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--app-text-primary);
  font-size: 0.8125rem;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  -webkit-line-clamp: 2;
}

.chat-image-task__meta span {
  color: var(--app-text-secondary);
  font-size: 0.6875rem;
  line-height: 1.4;
}

@keyframes image-task-scan {
  0%,
  100% {
    top: 0;
    opacity: 0.35;
  }

  50% {
    top: calc(100% - 2px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-image-task__scanner {
    animation: none;
  }
}
</style>
