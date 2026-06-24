<script setup lang="ts">
import { Camera, Delete, Edit } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { addSnapshot, deleteSnapshot, getSnapshotList, updateSnapshot } from '@/http/snapshot'
import { useProjectStore } from '@/stores/project'
import SnapshotFileTreeBranch from './SnapshotFileTreeBranch.vue'
import { buildSnapshotFileTree, getSnapshotDirExpandKey, type SnapshotFileItem, type SnapshotFileTreeNode } from './snapshotFileTree'

defineOptions({
  name: 'SnapshotPanel',
})

/** 版本快照最大保存数量 */
const MAX_SNAPSHOT_COUNT = 5

/** 版本号最大字符数 */
const MAX_SNAPSHOT_VERSION_LENGTH = 50

/** 版本描述最大字符数 */
const MAX_SNAPSHOT_DESC_LENGTH = 100

/** 按版本聚合后的快照 */
interface SnapshotVersionGroup {
  /** 版本号 */
  version: string
  /** 创建时间 */
  createdAt: string
  /** 版本描述 */
  desc: string
  /** 该版本下的文件列表 */
  files: SnapshotFileItem[]
  /** 该版本下的文件树 */
  fileTree: SnapshotFileTreeNode
}

const projectStore = useProjectStore()

/** 列表加载中 */
const listLoading = ref(false)

/** 保存快照中 */
const saving = ref(false)

/** 正在删除的版本号 */
const deletingVersion = ref('')

/** 修改快照中 */
const editing = ref(false)

/** 保存快照弹窗可见性 */
const saveDialogVisible = ref(false)

/** 编辑快照弹窗可见性 */
const editDialogVisible = ref(false)

/** 保存快照表单 */
const saveForm = ref({
  version: '',
  desc: '',
})

/** 编辑快照表单 */
const editForm = ref({
  oldVersion: '',
  version: '',
  desc: '',
})

/** 按版本聚合的快照列表 */
const versionGroups = ref<SnapshotVersionGroup[]>([])

/** 当前展开的版本号 */
const expandedVersions = ref<Set<string>>(new Set())

/** 目录展开状态，key 为「版本:路径」 */
const expandedDirs = ref<Record<string, boolean>>({})

/** 当前项目 ID */
const projectId = computed(() => projectStore.currentProject?.id ?? 0)

/**
 * 格式化创建时间
 * @param value 接口返回时间
 */
function formatCreatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

/**
 * 将接口列表按版本聚合
 * @param list 快照文件列表
 */
function groupSnapshotsByVersion(list: SnapshotFileItem[], projectDirPath: string): SnapshotVersionGroup[] {
  const map = new Map<string, SnapshotVersionGroup>()

  for (const item of list) {
    const existing = map.get(item.version)
    if (existing) {
      existing.files.push(item)
      continue
    }

    map.set(item.version, {
      version: item.version,
      createdAt: item.createdAt,
      desc: item.desc,
      files: [item],
      fileTree: { name: '', path: '', type: 'directory', children: [] },
    })
  }

  const groups = [...map.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  for (const group of groups) {
    group.fileTree = buildSnapshotFileTree(group.files, projectDirPath)
  }

  return groups
}

/**
 * 初始化版本文件树的一级目录展开状态
 * @param version 版本号
 * @param fileTree 文件树
 */
function initVersionTreeExpanded(version: string, fileTree: SnapshotFileTreeNode) {
  const hasInitialized = Object.keys(expandedDirs.value).some((key) => key.startsWith(`${version}:`))
  if (hasInitialized) return

  for (const child of fileTree.children ?? []) {
    if (child.type === 'directory') {
      expandedDirs.value[getSnapshotDirExpandKey(version, child.path)] = true
    }
  }
}

/**
 * 切换目录展开状态
 * @param version 版本号
 * @param path 目录路径
 */
function toggleDirectory(version: string, path: string) {
  const key = getSnapshotDirExpandKey(version, path)
  expandedDirs.value[key] = !expandedDirs.value[key]
}

/**
 * 切换版本折叠面板
 * @param version 版本号
 */
function toggleVersion(version: string) {
  const next = new Set(expandedVersions.value)
  if (next.has(version)) {
    next.delete(version)
  } else {
    next.add(version)
    const group = versionGroups.value.find((item) => item.version === version)
    if (group) {
      initVersionTreeExpanded(version, group.fileTree)
    }
  }
  expandedVersions.value = next
}

/**
 * 判断版本是否展开
 * @param version 版本号
 */
function isVersionExpanded(version: string) {
  return expandedVersions.value.has(version)
}

/**
 * 加载快照列表
 */
async function loadSnapshotList() {
  const currentProjectId = projectId.value
  if (!currentProjectId) return

  listLoading.value = true
  try {
    const list = await getSnapshotList({ projectId: currentProjectId })
    const files = list.map((item) => {
      const { fileContent, ...rest } = item
      void fileContent
      return rest
    })
    versionGroups.value = groupSnapshotsByVersion(files, projectStore.projectDirPath)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '快照列表加载失败')
  } finally {
    listLoading.value = false
  }
}

/**
 * 删除版本快照
 * @param version 版本号
 */
async function handleDeleteVersion(version: string) {
  const currentProjectId = projectId.value
  if (!currentProjectId) return

  try {
    await ElMessageBox.confirm(`确定要删除版本「${version}」吗？删除后不可恢复。`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    deletingVersion.value = version
    await deleteSnapshot({
      projectId: currentProjectId,
      version,
    })

    const nextExpandedVersions = new Set(expandedVersions.value)
    nextExpandedVersions.delete(version)
    expandedVersions.value = nextExpandedVersions

    const nextExpandedDirs = { ...expandedDirs.value }
    for (const key of Object.keys(nextExpandedDirs)) {
      if (key.startsWith(`${version}:`)) {
        delete nextExpandedDirs[key]
      }
    }
    expandedDirs.value = nextExpandedDirs

    ElMessage.success('版本快照删除成功')
    await loadSnapshotList()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '版本快照删除失败')
  } finally {
    deletingVersion.value = ''
  }
}

/**
 * 迁移版本展开状态（版本号变更时使用）
 * @param oldVersion 旧版本号
 * @param newVersion 新版本号
 */
function migrateVersionState(oldVersion: string, newVersion: string) {
  if (oldVersion === newVersion) return

  if (expandedVersions.value.has(oldVersion)) {
    const nextExpandedVersions = new Set(expandedVersions.value)
    nextExpandedVersions.delete(oldVersion)
    nextExpandedVersions.add(newVersion)
    expandedVersions.value = nextExpandedVersions
  }

  const nextExpandedDirs = { ...expandedDirs.value }
  for (const key of Object.keys(nextExpandedDirs)) {
    if (!key.startsWith(`${oldVersion}:`)) continue
    const path = key.slice(oldVersion.length + 1)
    const expanded = nextExpandedDirs[key]
    if (expanded === undefined) continue
    nextExpandedDirs[getSnapshotDirExpandKey(newVersion, path)] = expanded
    delete nextExpandedDirs[key]
  }
  expandedDirs.value = nextExpandedDirs
}

/**
 * 打开编辑快照弹窗
 * @param group 版本快照分组
 */
function openEditDialog(group: SnapshotVersionGroup) {
  editForm.value = {
    oldVersion: group.version,
    version: group.version,
    desc: group.desc,
  }
  editDialogVisible.value = true
}

/**
 * 提交修改版本快照
 */
async function handleUpdateSnapshot() {
  const version = editForm.value.version.trim()
  const oldVersion = editForm.value.oldVersion

  if (!version) {
    ElMessage.warning('请输入版本号')
    return
  }

  if (version !== oldVersion && versionGroups.value.some((group) => group.version === version)) {
    ElMessage.warning('该版本号已存在')
    return
  }

  const currentProjectId = projectId.value
  if (!currentProjectId) {
    ElMessage.warning('当前项目未就绪')
    return
  }

  editing.value = true
  try {
    await updateSnapshot({
      projectId: currentProjectId,
      oldVersion,
      version,
      desc: editForm.value.desc.trim(),
    })

    migrateVersionState(oldVersion, version)
    ElMessage.success('版本快照修改成功')
    editDialogVisible.value = false
    await loadSnapshotList()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '版本快照修改失败')
  } finally {
    editing.value = false
  }
}

/**
 * 判断是否已达版本快照数量上限
 */
function isSnapshotLimitReached() {
  return versionGroups.value.length >= MAX_SNAPSHOT_COUNT
}

/**
 * 打开保存快照弹窗
 */
function openSaveDialog() {
  if (isSnapshotLimitReached()) {
    ElMessage.warning(`版本快照最多保存 ${MAX_SNAPSHOT_COUNT} 个，请先删除不用的存档后再保存`)
    return
  }

  saveForm.value = {
    version: '',
    desc: '',
  }
  saveDialogVisible.value = true
}

/**
 * 提交保存当前版本快照
 */
async function handleSaveSnapshot() {
  const version = saveForm.value.version.trim()
  if (!version) {
    ElMessage.warning('请输入版本号')
    return
  }

  const currentProjectId = projectId.value
  if (!currentProjectId) {
    ElMessage.warning('当前项目未就绪')
    return
  }

  if (isSnapshotLimitReached()) {
    ElMessage.warning(`版本快照最多保存 ${MAX_SNAPSHOT_COUNT} 个，请先删除不用的存档后再保存`)
    return
  }

  let dirPath = ''
  try {
    dirPath = projectStore.requireProjectDirPath()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目目录未就绪')
    return
  }

  saving.value = true
  try {
    await addSnapshot({
      projectId: currentProjectId,
      dirPath,
      version,
      desc: saveForm.value.desc.trim(),
    })
    ElMessage.success('版本快照保存成功')
    saveDialogVisible.value = false
    await loadSnapshotList()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '版本快照保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadSnapshotList()
})
</script>

<template>
  <div v-loading="listLoading" class="snapshot-panel">
    <div class="snapshot-panel-header">
      <h1 class="snapshot-panel-title">版本快照</h1>
      <button type="button" class="snapshot-panel-save-btn" @click="openSaveDialog">
        <el-icon class="snapshot-panel-save-icon">
          <Camera />
        </el-icon>
        <span class="snapshot-panel-save-text">保存当前版本</span>
      </button>
    </div>
    <div v-if="!listLoading && versionGroups.length === 0" class="snapshot-panel-empty">暂无版本快照</div>
    <ul v-else class="snapshot-panel-list">
      <li v-for="group in versionGroups" :key="group.version" class="snapshot-panel-group">
        <div class="snapshot-panel-toggle">
          <button type="button" class="snapshot-panel-toggle-main" @click="toggleVersion(group.version)">
            <div class="snapshot-panel-summary">
              <span class="snapshot-panel-version">{{ group.version }}</span>
              <span class="snapshot-panel-time">{{ formatCreatedAt(group.createdAt) }}</span>
            </div>
          </button>
          <div class="snapshot-operation-container">
            <button type="button" class="snapshot-panel-edit-btn" aria-label="编辑版本快照" @click="openEditDialog(group)">
              <el-icon class="snapshot-panel-edit-icon">
                <Edit />
              </el-icon>
            </button>
            <button
              type="button"
              class="snapshot-panel-delete-btn"
              :disabled="deletingVersion === group.version"
              aria-label="删除版本快照"
              @click="handleDeleteVersion(group.version)"
            >
              <el-icon class="snapshot-panel-delete-icon">
                <Delete />
              </el-icon>
            </button>
            <button type="button" class="snapshot-panel-expand-btn" aria-label="展开或收起版本快照" @click="toggleVersion(group.version)">
              <svg class="snapshot-panel-arrow" :class="{ 'snapshot-panel-arrow--expanded': isVersionExpanded(group.version) }" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <div v-show="isVersionExpanded(group.version)" class="snapshot-panel-detail">
          <p v-if="group.desc" class="snapshot-panel-desc">{{ group.desc }}</p>
          <div v-if="group.fileTree.children?.length" class="snapshot-panel-file-tree">
            <ul class="file-tree">
              <li v-for="node in group.fileTree.children" :key="node.path" class="file-tree-node">
                <SnapshotFileTreeBranch :version="group.version" :node="node" :depth="0" :expanded-dirs="expandedDirs" @dir-toggle="toggleDirectory(group.version, $event)" />
              </li>
            </ul>
          </div>
          <div v-else class="snapshot-panel-file-tree-empty">暂无文件</div>
        </div>
      </li>
    </ul>

    <el-dialog v-model="editDialogVisible" title="编辑版本快照" width="26rem" append-to-body>
      <el-form label-position="top">
        <el-form-item label="版本号" required>
          <el-input v-model="editForm.version" placeholder="请输入版本号，如 v1.0.0" :maxlength="MAX_SNAPSHOT_VERSION_LENGTH" show-word-limit clearable />
        </el-form-item>
        <el-form-item label="版本描述">
          <el-input v-model="editForm.desc" type="textarea" :rows="3" placeholder="请输入版本描述（选填）" :maxlength="MAX_SNAPSHOT_DESC_LENGTH" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editing" @click="handleUpdateSnapshot">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="saveDialogVisible" title="保存当前版本" width="26rem" append-to-body>
      <el-form label-position="top">
        <el-form-item label="版本号" required>
          <el-input v-model="saveForm.version" placeholder="请输入版本号，如 v1.0.0" :maxlength="MAX_SNAPSHOT_VERSION_LENGTH" show-word-limit clearable />
        </el-form-item>
        <el-form-item label="版本描述">
          <el-input v-model="saveForm.desc" type="textarea" :rows="3" placeholder="请输入版本描述（选填）" :maxlength="MAX_SNAPSHOT_DESC_LENGTH" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveSnapshot">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.snapshot-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

.snapshot-panel::-webkit-scrollbar {
  width: 6px;
}

.snapshot-panel::-webkit-scrollbar-track {
  background: var(--app-scrollbar-track);
}

.snapshot-panel::-webkit-scrollbar-thumb {
  background-color: var(--app-scrollbar-thumb);
  border-radius: 999px;
  border: 1px solid transparent;
  background-clip: padding-box;
  transition: background-color 0.2s ease;
}

.snapshot-panel::-webkit-scrollbar-thumb:hover {
  background-color: var(--app-scrollbar-thumb-hover);
}

.snapshot-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.snapshot-panel-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
}

.snapshot-panel-save-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.625rem;
  border: 1px solid var(--snapshot-accent-border);
  border-radius: 6px;
  background: var(--snapshot-accent-bg);
  color: var(--snapshot-accent-text);
  font-size: 0.875rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.snapshot-panel-save-btn:hover {
  background: var(--snapshot-accent-bg-hover);
  border-color: var(--snapshot-accent-border-hover);
}

.snapshot-panel-save-icon {
  flex-shrink: 0;
  font-size: 1rem;
}

.snapshot-panel-save-icon :deep(svg) {
  display: block;
}

.snapshot-panel-save-text {
  line-height: 1;
}

.snapshot-panel-empty {
  color: var(--app-text-muted);
  font-size: 0.875rem;
}

.snapshot-panel-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.snapshot-panel-group {
  border: 1px solid var(--snapshot-group-border);
  border-radius: 8px;
  overflow: hidden;
}

.snapshot-panel-group + .snapshot-panel-group {
  margin-top: 0.75rem;
}

.snapshot-panel-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  background: var(--snapshot-accent-bg);
  color: var(--snapshot-accent-text);
  transition: background-color 0.2s ease;
}

.snapshot-panel-toggle:hover {
  background: var(--snapshot-accent-bg-hover);
}

.snapshot-panel-toggle-main {
  flex: 1;
  min-width: 0;
  padding: 0.75rem 0 0.75rem 1rem;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.snapshot-panel-summary {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.snapshot-operation-container {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  padding-right: 0.75rem;
}

.snapshot-panel-edit-btn,
.snapshot-panel-delete-btn,
.snapshot-panel-expand-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--snapshot-accent-text-muted);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.snapshot-panel-edit-btn:hover,
.snapshot-panel-delete-btn:hover:not(:disabled),
.snapshot-panel-expand-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--snapshot-accent-text);
}

html.dark .snapshot-panel-edit-btn:hover,
html.dark .snapshot-panel-delete-btn:hover:not(:disabled),
html.dark .snapshot-panel-expand-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.snapshot-panel-edit-icon,
.snapshot-panel-delete-icon {
  font-size: 1rem;
  line-height: 1;
}

.snapshot-panel-edit-icon :deep(svg),
.snapshot-panel-delete-icon :deep(svg) {
  display: block;
}

.snapshot-panel-delete-btn:hover:not(:disabled) {
  color: var(--app-danger);
}

.snapshot-panel-delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.snapshot-panel-version {
  color: var(--snapshot-accent-text);
  font-size: 0.9375rem;
  font-weight: 700;
}

.snapshot-panel-time {
  color: var(--snapshot-accent-text-muted);
  font-size: 0.8125rem;
}

.snapshot-panel-arrow {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  color: var(--snapshot-accent-text-muted);
  transition: transform 0.2s ease;
}

.snapshot-panel-arrow--expanded {
  transform: rotate(180deg);
}

.snapshot-panel-detail {
  padding: 0 1rem 0.75rem;
  border-top: 1px solid var(--snapshot-group-border);
  background: var(--snapshot-detail-bg);
}

.snapshot-panel-desc {
  margin: 0.75rem 0 0.5rem;
  color: var(--app-text-secondary);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.snapshot-panel-file-tree {
  margin-top: 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background-color: var(--app-bg-muted);
  overflow: auto;
}

.file-tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

.snapshot-panel-file-tree-empty {
  margin-top: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background-color: var(--app-bg-muted);
  color: var(--app-text-muted);
  font-size: 0.8125rem;
}
</style>

<style scoped>
/* 浅色主题：版本下拉浅蓝配色 */
.snapshot-panel {
  --snapshot-accent-bg: #eef4ff;
  --snapshot-accent-bg-hover: #dbe8ff;
  --snapshot-accent-text: #1e4fa8;
  --snapshot-accent-text-muted: #5b7fc7;
  --snapshot-accent-border: #c7daff;
  --snapshot-accent-border-hover: #a3c4ff;
  --snapshot-group-border: #c7daff;
  --snapshot-detail-bg: #f8fbff;
}

/* 深色主题：版本下拉浅蓝暗色适配 */
html.dark .snapshot-panel {
  --snapshot-accent-bg: #1a2744;
  --snapshot-accent-bg-hover: #223358;
  --snapshot-accent-text: #9ec0ff;
  --snapshot-accent-text-muted: #7a9fd4;
  --snapshot-accent-border: #2d4470;
  --snapshot-accent-border-hover: #3d5a8c;
  --snapshot-group-border: #2d4470;
  --snapshot-detail-bg: #141c2e;
}
</style>
