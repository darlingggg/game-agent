<script setup lang="ts">
import type { FileTreeNode } from './projectTempFiles'

defineOptions({
  name: 'FileTreeBranch',
})

const props = defineProps<{
  /** 当前树节点 */
  node: FileTreeNode
  /** 缩进层级 */
  depth: number
  /** 目录展开状态 */
  expandedDirs: Record<string, boolean>
  /** 当前选中的文件路径 */
  selectedFilePath: string
}>()

const emit = defineEmits<{
  /** 节点点击事件 */
  nodeClick: [node: FileTreeNode]
}>()

/**
 * 判断目录是否展开
 * @param path 目录相对路径
 */
function isDirectoryExpanded(path: string) {
  return props.expandedDirs[path] ?? false
}

/**
 * 判断文件是否选中
 * @param path 文件相对路径
 */
function isFileSelected(path: string) {
  return props.selectedFilePath === path
}

/**
 * 处理节点点击
 */
function handleClick() {
  emit('nodeClick', props.node)
}
</script>

<template>
  <div class="file-tree-branch">
    <div
      class="file-tree-item"
      :class="{
        'file-tree-item--directory': node.type === 'directory',
        'file-tree-item--file': node.type === 'file',
        'file-tree-item--selected': node.type === 'file' && isFileSelected(node.path),
      }"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="handleClick"
    >
      <span
        v-if="node.type === 'directory'"
        class="file-tree-arrow"
        :style="{ transform: isDirectoryExpanded(node.path) ? 'rotate(90deg)' : 'rotate(0deg)' }"
      >
        ▶
      </span>
      <span v-else class="file-tree-arrow file-tree-arrow--placeholder" />
      <span class="file-tree-name">{{ node.name }}</span>
    </div>
    <ul
      v-if="node.type === 'directory' && isDirectoryExpanded(node.path) && node.children?.length"
      class="file-tree-children"
    >
      <li v-for="child in node.children" :key="child.path">
        <FileTreeBranch
          :node="child"
          :depth="depth + 1"
          :expanded-dirs="expandedDirs"
          :selected-file-path="selectedFilePath"
          @node-click="emit('nodeClick', $event)"
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
  gap: 0.25rem;
  padding: 0.375rem;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  user-select: none;
}

.file-tree-item:hover {
  background-color: #eef3ff;
}

.file-tree-item--selected {
  background-color: #dbe7ff;
  color: #2463dc;
}

.file-tree-arrow {
  width: 12px;
  font-size: 0.625rem;
  color: #666;
  transition: transform 0.2s ease;
}

.file-tree-arrow--placeholder {
  visibility: hidden;
}
</style>
