<script setup lang="ts">
import { ref, watch } from 'vue'
import FileEditor from './FileEditor.vue'
import FileTreeBranch from './FileTreeBranch.vue'
import { projectTempFileContents, projectTempFileTree, type FileTreeNode } from './projectTempFiles'

defineOptions({
  name: 'FilePanel',
})

/** 目录展开状态，key 为目录相对路径 */
const expandedDirs = ref<Record<string, boolean>>({
  '': true,
  src: true,
  public: true,
  '.vscode': true,
})

/** 当前选中的文件路径 */
const selectedFilePath = ref('')

/** 编辑器中的文件内容 */
const editorContent = ref('')

/** 切换文件时同步编辑器内容 */
watch(
  selectedFilePath,
  (filePath) => {
    if (!filePath) {
      editorContent.value = ''
      return
    }
    editorContent.value = projectTempFileContents[filePath] ?? ''
  },
  { immediate: true },
)

/**
 * 处理树节点点击：目录展开/收起，文件展示内容
 * @param node 树节点
 */
function handleNodeClick(node: FileTreeNode) {
  if (node.type === 'directory') {
    expandedDirs.value[node.path] = !expandedDirs.value[node.path]
    return
  }
  selectedFilePath.value = node.path
}

/** 保存当前文件，具体逻辑后续实现 */
function handleSave() {
  // TODO: 保存文件内容
}
</script>

<template>
  <div class="file-panel">
    <aside class="file-panel-tree">
      <div class="file-panel-tree-title">projectTemp</div>
      <ul class="file-tree">
        <li v-for="node in projectTempFileTree.children" :key="node.path" class="file-tree-node">
          <FileTreeBranch
            :node="node"
            :depth="0"
            :expanded-dirs="expandedDirs"
            :selected-file-path="selectedFilePath"
            @node-click="handleNodeClick"
          />
        </li>
      </ul>
    </aside>
    <section class="file-panel-content">
      <div v-if="selectedFilePath" class="file-panel-content-header">
        <span class="file-panel-content-path">{{ selectedFilePath }}</span>
        <button type="button" class="file-panel-save-btn" @click="handleSave">保存</button>
      </div>
      <FileEditor
        v-if="selectedFilePath"
        v-model="editorContent"
        class="file-panel-editor"
        :file-path="selectedFilePath"
      />
      <div v-else class="file-panel-content-empty">请选择左侧文件查看内容</div>
    </section>
  </div>
</template>

<style scoped>
.file-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  overflow: hidden;
}

.file-panel-tree {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid #e5e5e5;
  background-color: #fbfcff;
  overflow: auto;
}

.file-panel-tree-title {
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #2463dc;
  border-bottom: 1px solid #e5e5e5;
}

.file-tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-panel-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background-color: #fff;
}

.file-panel-content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.375rem 1rem;
  font-size: 0.875rem;
  color: #666;
  border-bottom: 1px solid #e5e5e5;
  background-color: #fcfcfd;
}

.file-panel-content-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-panel-save-btn {
  flex-shrink: 0;
  padding: 0.375rem 1rem;
  border: 1px solid #2463dc;
  border-radius: 4px;
  background-color: #2463dc;
  color: #fff;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.file-panel-save-btn:hover {
  background-color: #1d4fb8;
}

.file-panel-editor {
  flex: 1;
  min-height: 0;
}

.file-panel-content-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 0.875rem;
}
</style>
