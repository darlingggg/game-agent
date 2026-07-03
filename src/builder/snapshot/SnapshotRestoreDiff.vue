<script setup lang="ts">
import { computed } from 'vue'
import { buildLineChangeDisplay } from './snapshotRestore'

defineOptions({
  name: 'SnapshotRestoreDiff',
})

const props = defineProps<{
  /** 展示模式：新增仅显示 +N，覆盖显示 from → to (+/-N) */
  mode: 'added' | 'overwrite'
  /** 当前行数（覆盖模式） */
  currentLines?: number
  /** 目标行数 */
  targetLines?: number
  /** 当前字节数（覆盖模式） */
  currentBytes?: number
  /** 目标字节数（覆盖模式） */
  targetBytes?: number
}>()

/** 差值展示数据 */
const display = computed(() => {
  if (props.mode === 'added') {
    if (props.targetLines === undefined) return null
    return {
      fromValue: 0,
      toValue: props.targetLines,
      unit: 'line' as const,
      diff: props.targetLines,
    }
  }

  if (props.currentLines === undefined || props.targetLines === undefined) {
    return null
  }

  return buildLineChangeDisplay(
    props.currentLines,
    props.targetLines,
    props.currentBytes,
    props.targetBytes,
  )
})

/**
 * 格式化差值文本
 * @param diff 差值
 * @param unit 单位
 */
function formatDelta(diff: number, unit: 'line' | 'byte') {
  const prefix = diff > 0 ? `+${diff}` : `${diff}`
  return unit === 'byte' ? `${prefix} B` : prefix
}
</script>

<template>
  <span v-if="display" class="snapshot-restore-diff">
    <!-- 新增：仅展示绿色 +N -->
    <template v-if="mode === 'added'">
      <span class="snapshot-restore-diff-delta is-add">+{{ display.toValue }}</span>
    </template>

    <!-- 覆盖：变更前 → 变更后 (+/-差值) -->
    <template v-else>
      <span class="snapshot-restore-diff-from">{{ display.fromValue }}</span>
      <span class="snapshot-restore-diff-arrow">→</span>
      <span class="snapshot-restore-diff-to">{{ display.toValue }}</span>
      <span v-if="display.unit === 'byte'" class="snapshot-restore-diff-suffix">B</span>
      <span
        v-if="display.diff !== 0"
        class="snapshot-restore-diff-delta"
        :class="display.diff > 0 ? 'is-add' : 'is-remove'"
      >
        ({{ formatDelta(display.diff, display.unit) }})
      </span>
    </template>
  </span>
</template>

<style scoped>
.snapshot-restore-diff {
  margin-left: 0.375rem;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: nowrap;
}

/* 变更前：暖色 */
.snapshot-restore-diff-from {
  color: #b45309;
  font-weight: 600;
}

/* 变更后：蓝色 */
.snapshot-restore-diff-to {
  color: #2563eb;
  font-weight: 600;
}

.snapshot-restore-diff-arrow {
  margin: 0 0.125rem;
  color: var(--app-text-muted);
}

.snapshot-restore-diff-suffix {
  margin-left: 0.125rem;
  color: var(--app-text-muted);
}

/* 增加：绿色 */
.snapshot-restore-diff-delta.is-add {
  margin-left: 0.25rem;
  color: #16a34a;
  font-weight: 600;
}

/* 减少：红色 */
.snapshot-restore-diff-delta.is-remove {
  margin-left: 0.25rem;
  color: var(--app-danger);
  font-weight: 600;
}
</style>

<style scoped>
html.dark .snapshot-restore-diff-from {
  color: #fbbf24;
}

html.dark .snapshot-restore-diff-to {
  color: #60a5fa;
}

html.dark .snapshot-restore-diff-delta.is-add {
  color: #4ade80;
}
</style>
