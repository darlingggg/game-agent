<script setup lang="ts">
import { Document, Folder, FolderOpened } from '@element-plus/icons-vue'

defineOptions({
  name: 'FileTreeNodeIcon',
})

defineProps<{
  /** 节点类型 */
  type: 'file' | 'directory'
  /** 目录是否展开，仅目录节点有效 */
  expanded?: boolean
}>()
</script>

<template>
  <el-icon
    class="file-tree-icon"
    :class="{
      'file-tree-icon--directory': type === 'directory',
      'file-tree-icon--file': type === 'file',
    }"
  >
    <FolderOpened v-if="type === 'directory' && expanded" />
    <Folder v-else-if="type === 'directory'" />
    <Document v-else />
  </el-icon>
</template>

<style scoped>
.file-tree-icon {
  flex-shrink: 0;
  font-size: 1rem;
  line-height: 1;
}

.file-tree-icon :deep(svg) {
  display: block;
}

.file-tree-icon--directory {
  color: var(--file-tree-folder-icon);
}

.file-tree-icon--file {
  color: var(--file-tree-file-icon);
}
</style>

<style scoped>
.file-tree-icon {
  --file-tree-folder-icon: #ca9834;
  --file-tree-file-icon: var(--app-text-secondary);
}

html.dark .file-tree-icon {
  --file-tree-folder-icon: #e8b84a;
  --file-tree-file-icon: var(--app-text-muted);
}
</style>
