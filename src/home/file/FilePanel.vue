<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref, watch } from 'vue'
import { syncPreviewFile } from '../preview/webcontainer'
import FileEditor from './FileEditor.vue'
import FileTreeBranch from './FileTreeBranch.vue'
import {
  fetchProjectTempFileContent,
  loadProjectTempFileTree,
  saveProjectTempFileContent,
  type FileTreeNode,
} from './projectTempFiles'

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

/** projectTemp 文件树 */
const fileTree = ref<FileTreeNode | null>(null)

/** 文件树加载状态 */
const treeLoading = ref(false)

/** 文件内容加载状态 */
const contentLoading = ref(false)

/** 文件树加载错误 */
const treeError = ref('')

/** 当前文件内容加载错误 */
const contentError = ref('')

/** 文件保存中 */
const saving = ref(false)

onMounted(async () => {
  treeLoading.value = true
  treeError.value = ''
  try {
    fileTree.value = await loadProjectTempFileTree()
  } catch (error) {
    treeError.value = error instanceof Error ? error.message : '文件列表加载失败'
  } finally {
    treeLoading.value = false
  }
})

/** 切换文件时异步拉取文件内容，取消过期的请求结果 */
watch(selectedFilePath, async (filePath, _, onCleanup) => {
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })

  if (!filePath) {
    editorContent.value = ''
    contentError.value = ''
    contentLoading.value = false
    return
  }

  contentLoading.value = true
  contentError.value = ''
  editorContent.value = ''

  try {
    const content = await fetchProjectTempFileContent(filePath)
    if (cancelled) return
    editorContent.value = content
  } catch (error) {
    if (cancelled) return
    editorContent.value = ''
    contentError.value = error instanceof Error ? error.message : '文件内容加载失败'
  } finally {
    if (!cancelled) {
      contentLoading.value = false
    }
  }
})

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

/**
 * 保存当前编辑的文件，并同步到预览环境
 */
async function handleSave() {
  const filePath = selectedFilePath.value
  if (!filePath || contentLoading.value || contentError.value || saving.value) {
    return
  }

  saving.value = true
  try {
    await saveProjectTempFileContent(filePath, editorContent.value)
    await syncPreviewFile(filePath, editorContent.value)
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="file-panel">
    <aside class="file-panel-tree">
      <div class="file-panel-tree-title">projectTemp</div>
      <div v-if="treeLoading" class="file-panel-tree-status">正在加载文件列表...</div>
      <div
        v-else-if="treeError && !fileTree"
        class="file-panel-tree-status file-panel-tree-status--error"
      >
        {{ treeError }}
      </div>
      <ul v-else-if="fileTree?.children?.length" class="file-tree">
        <li v-for="node in fileTree.children" :key="node.path" class="file-tree-node">
          <FileTreeBranch
            :node="node"
            :depth="0"
            :expanded-dirs="expandedDirs"
            :selected-file-path="selectedFilePath"
            @node-click="handleNodeClick"
          />
        </li>
      </ul>
      <div v-else class="file-panel-tree-status">暂无文件</div>
    </aside>
    <section class="file-panel-content">
      <div v-if="selectedFilePath" class="file-panel-content-header">
        <span class="file-panel-content-path">{{ selectedFilePath }}</span>
        <button
          type="button"
          class="file-panel-save-btn"
          :class="{ 'file-panel-save-btn--loading': saving }"
          :disabled="contentLoading || !!contentError || saving"
          @click="handleSave"
        >
          保存
        </button>
      </div>
      <div v-if="contentLoading" class="file-panel-content-empty">正在加载文件内容...</div>
      <div
        v-else-if="contentError"
        class="file-panel-content-empty file-panel-content-empty--error"
      >
        {{ contentError }}
      </div>
      <FileEditor
        v-else-if="selectedFilePath"
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

.file-panel-tree-status {
  padding: 1rem;
  font-size: 0.8125rem;
  color: #999;
}

.file-panel-tree-status--error {
  color: #c0392b;
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
  background-color: #1e1e1e;
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
  width: 4.5rem;
  padding: 0.375rem 0;
  border: 1px solid #2463dc;
  border-radius: 4px;
  background-color: #2463dc;
  color: #fff;
  font-size: 0.8125rem;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.file-panel-save-btn--loading {
  position: relative;
  color: transparent;
}

.file-panel-save-btn--loading::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: file-panel-save-spin 0.8s linear infinite;
}

@keyframes file-panel-save-spin {
  to {
    transform: rotate(360deg);
  }
}

.file-panel-save-btn:hover:not(:disabled) {
  background-color: #1d4fb8;
}

.file-panel-save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.file-panel-editor {
  flex: 1;
  min-height: 0;
  color: #999;
}

.file-panel-content-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  color: #999;
  font-size: 0.875rem;
  text-align: center;
}

.file-panel-content-empty--error {
  color: #f48771;
}
</style>
