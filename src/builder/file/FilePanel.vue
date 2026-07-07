<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { syncPreviewFile } from '../preview/webcontainer'
import FileEditor from './FileEditor.vue'
import FileTreeBranch from './FileTreeBranch.vue'
import { fetchProjectTempFileContent, isAgentBaseReadOnlyPath, loadProjectTempFileTree, saveProjectTempFileContent, type FileTreeNode } from './projectTempFiles'
import { PROJECT_FILES_CHANGED_EVENT } from '../snapshot/snapshotRestore'

defineOptions({
  name: 'FilePanel',
})

const projectStore = useProjectStore()
const { currentProject } = storeToRefs(projectStore)

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

/** 当前文件是否为 agent_base 只读文件 */
const isCurrentFileReadOnly = computed(() => {
  if (!selectedFilePath.value) return false
  return isAgentBaseReadOnlyPath(selectedFilePath.value)
})

/** 左侧目录是否收起 */
const treeCollapsed = ref(false)

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
  if (!filePath || contentLoading.value || contentError.value || saving.value || isCurrentFileReadOnly.value) {
    return
  }

  saving.value = true
  try {
    await saveProjectTempFileContent(filePath, editorContent.value)
    await syncPreviewFile(filePath, editorContent.value)
    ElMessage.success('保存成功')
  } catch {
    // 统一处理异常
  } finally {
    saving.value = false
  }
}

/**
 * 拦截 Ctrl+S / Cmd+S，调用保存而非浏览器原生保存
 * @param event 键盘事件
 */
function handleSaveShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
    return
  }

  if (isCurrentFileReadOnly.value) {
    event.preventDefault()
    ElMessage.warning('该文件只能查看，不允许编辑')
    return
  }

  event.preventDefault()
  void handleSave()
}

/**
 * 重新加载项目文件树
 */
async function reloadFileTree() {
  treeLoading.value = true
  treeError.value = ''
  try {
    fileTree.value = await loadProjectTempFileTree()
  } catch (error) {
    treeError.value = error instanceof Error ? error.message : '文件列表加载失败'
  } finally {
    treeLoading.value = false
  }
}

/**
 * 版本还原等操作后刷新文件树，并清理已删除文件的选中状态
 */
async function handleProjectFilesChanged() {
  const previousSelectedPath = selectedFilePath.value
  await reloadFileTree()

  if (!previousSelectedPath) return

  const stillExists = (nodes: FileTreeNode[] | undefined): boolean => {
    if (!nodes) return false
    for (const node of nodes) {
      if (node.type === 'file' && node.path === previousSelectedPath) return true
      if (node.type === 'directory' && stillExists(node.children)) return true
    }
    return false
  }

  if (!stillExists(fileTree.value?.children)) {
    selectedFilePath.value = ''
    editorContent.value = ''
    contentError.value = ''
    return
  }

  contentLoading.value = true
  contentError.value = ''
  try {
    editorContent.value = await fetchProjectTempFileContent(previousSelectedPath)
  } catch (error) {
    editorContent.value = ''
    contentError.value = error instanceof Error ? error.message : '文件内容加载失败'
  } finally {
    contentLoading.value = false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleSaveShortcut, true)
  window.addEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged)
  await reloadFileTree()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleSaveShortcut, true)
  window.removeEventListener(PROJECT_FILES_CHANGED_EVENT, handleProjectFilesChanged)
})
</script>

<template>
  <div class="file-panel">
    <aside v-show="!treeCollapsed" class="file-panel-tree">
      <div class="file-panel-tree-header">
        <div class="file-panel-tree-title">{{ currentProject?.title ?? '项目文件' }}</div>
        <button
          type="button"
          class="file-panel-tree-toggle-btn"
          title="收起目录"
          aria-label="收起目录"
          @click="treeCollapsed = true"
        >
          <el-icon><DArrowLeft /></el-icon>
        </button>
      </div>
      <div v-if="treeLoading" class="file-panel-tree-status">正在加载文件列表...</div>
      <div v-else-if="treeError && !fileTree" class="file-panel-tree-status file-panel-tree-status--error">
        {{ treeError }}
      </div>
      <ul v-else-if="fileTree?.children?.length" class="file-tree">
        <li v-for="node in fileTree.children" :key="node.path" class="file-tree-node">
          <FileTreeBranch :node="node" :depth="0" :expanded-dirs="expandedDirs" :selected-file-path="selectedFilePath" @node-click="handleNodeClick" />
        </li>
      </ul>
      <div v-else class="file-panel-tree-status">暂无文件</div>
    </aside>
    <section class="file-panel-content">
      <div v-if="treeCollapsed || selectedFilePath" class="file-panel-content-header">
        <div class="file-panel-content-header-left">
          <button
            v-if="treeCollapsed"
            type="button"
            class="file-panel-tree-toggle-btn"
            title="展开目录"
            aria-label="展开目录"
            @click="treeCollapsed = false"
          >
            <el-icon><DArrowRight /></el-icon>
          </button>
          <span v-if="selectedFilePath" class="file-panel-content-path">{{ selectedFilePath }}</span>
        </div>
        <button
          v-if="selectedFilePath"
          type="button"
          class="file-panel-save-btn"
          :class="{ 'file-panel-save-btn--loading': saving }"
          :disabled="contentLoading || !!contentError || saving || isCurrentFileReadOnly"
          @click="handleSave"
        >
          保存
        </button>
      </div>
      <div v-if="contentLoading" class="file-panel-content-empty">正在加载文件内容...</div>
      <div v-else-if="contentError" class="file-panel-content-empty file-panel-content-empty--error">
        {{ contentError }}
      </div>
      <FileEditor
        v-else-if="selectedFilePath"
        v-model="editorContent"
        class="file-panel-editor"
        :file-path="selectedFilePath"
        :read-only="isCurrentFileReadOnly"
      />
      <div v-else class="file-panel-content-empty">
        {{ treeCollapsed ? '点击左上角按钮展开目录并选择文件' : '请选择左侧文件查看内容' }}
      </div>
    </section>
  </div>
</template>

<style scoped>
.file-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  overflow: hidden;
}

.file-panel-tree {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--app-border);
  background-color: var(--app-bg-muted);
  overflow: auto;
}

.file-panel-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.625rem 0.75rem 1rem;
  border-bottom: 1px solid var(--app-border);
}

.file-panel-tree-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--app-accent);
}

.file-panel-tree-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.625rem;
  height: 1.625rem;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background-color: var(--app-surface);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.file-panel-tree-toggle-btn:hover {
  color: var(--app-accent);
  border-color: var(--app-accent);
  background-color: var(--app-bg-muted);
}

.file-panel-tree-toggle-btn :deep(svg) {
  display: block;
}

.file-panel-tree-status {
  padding: 1rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

.file-panel-tree-status--error {
  color: var(--app-error);
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
  color: var(--app-text-secondary);
  border-bottom: 1px solid var(--app-border);
  background-color: var(--app-surface);
}

.file-panel-content-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.file-panel-content-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-primary);
}

.file-panel-save-btn {
  flex-shrink: 0;
  width: 4.5rem;
  padding: 0.375rem 0;
  border: 1px solid var(--app-accent);
  border-radius: 4px;
  background-color: var(--app-accent);
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
  filter: brightness(0.9);
}

.file-panel-save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.file-panel-editor {
  flex: 1;
  min-height: 0;
  color: var(--app-text-muted);
}

.file-panel-content-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  color: var(--app-text-muted);
  font-size: 0.875rem;
  text-align: center;
  background-color: #1e1e1e;
}

.file-panel-content-empty--error {
  color: #f48771;
}
</style>
