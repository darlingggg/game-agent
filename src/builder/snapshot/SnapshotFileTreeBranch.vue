<script setup lang="ts">
import FileTreeNodeIcon from '../file/FileTreeNodeIcon.vue'
import type { SnapshotFileTreeNode } from './snapshotFileTree'
import { getSnapshotDirExpandKey } from './snapshotFileTree'

defineOptions({
  name: 'SnapshotFileTreeBranch',
})

const props = defineProps<{
  /** 当前版本号 */
  version: string
  /** 当前树节点 */
  node: SnapshotFileTreeNode
  /** 缩进层级 */
  depth: number
  /** 目录展开状态 */
  expandedDirs: Record<string, boolean>
}>()

const emit = defineEmits<{
  /** 目录节点点击事件 */
  dirToggle: [path: string]
}>()

/**
 * 判断目录是否展开
 * @param path 目录相对路径
 */
function isDirectoryExpanded(path: string) {
  return props.expandedDirs[getSnapshotDirExpandKey(props.version, path)] ?? false
}

/**
 * 处理节点点击
 */
function handleClick() {
  if (props.node.type !== 'directory') return
  emit('dirToggle', props.node.path)
}
</script>

<template>
  <div class="file-tree-branch">
    <div
      class="file-tree-item"
      :class="{
        'file-tree-item--directory': node.type === 'directory',
        'file-tree-item--file': node.type === 'file',
      }"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="handleClick"
    >
      <FileTreeNodeIcon
        :type="node.type"
        :expanded="node.type === 'directory' ? isDirectoryExpanded(node.path) : undefined"
      />
      <span class="file-tree-name">{{ node.name }}</span>
      <span v-if="node.type === 'file' && node.meta" class="file-tree-meta">
        {{ node.meta.bytes }} B · {{ node.meta.length }} 行
      </span>
    </div>
    <ul
      v-if="node.type === 'directory' && isDirectoryExpanded(node.path) && node.children?.length"
      class="file-tree-children"
    >
      <li v-for="child in node.children" :key="child.path">
        <SnapshotFileTreeBranch
          :version="version"
          :node="child"
          :depth="depth + 1"
          :expanded-dirs="expandedDirs"
          @dir-toggle="emit('dirToggle', $event)"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.file-tree-children {
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-tree-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem;
  font-size: 14px;
  color: var(--app-text-primary);
  cursor: default;
  user-select: none;
}

.file-tree-item--directory {
  cursor: pointer;
}

.file-tree-item--directory:hover {
  background-color: var(--app-surface-hover);
}

.file-tree-item--file {
  cursor: default;
}

.file-tree-item--file:hover {
  background-color: var(--app-surface-hover);
}

.file-tree-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-meta {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 0.5rem;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
</style>
