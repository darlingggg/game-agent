<script setup lang="ts">
import SvgIcon from '@/components/SvgIcon.vue'
import { Camera, Delete, Edit, RefreshLeft } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { fetchProjectTempFileList } from '@/builder/file/projectTempFiles'
import { useBuildContext } from '@/builder/build/buildContext'
import { addSnapshot, deleteSnapshot, getSnapshotList, updateSnapshot } from '@/http/snapshot'
import { getProjectVersion } from '@/http/project'
import { useProjectStore } from '@/stores/project'
import SnapshotFileTreeBranch from './SnapshotFileTreeBranch.vue'
import { buildSnapshotFileTree, getSnapshotDirExpandKey, type SnapshotFileItem, type SnapshotFileTreeNode } from './snapshotFileTree'
import {
  buildSnapshotRestorePlan,
  executeSnapshotRestore,
  hasSnapshotRestoreChanges,
  type SnapshotRestorePlan,
} from './snapshotRestore'
import SnapshotRestoreDiff from './SnapshotRestoreDiff.vue'
defineOptions({
  name: 'SnapshotPanel',
})

/** 版本快照最大保存数量（按 type 分别计数） */
const MAX_SNAPSHOT_COUNT = 5

/** 快照类型：用户创建的版本快照 */
const SNAPSHOT_TYPE_USER = 0

/** 快照类型：模板更新前自动存档 */
const SNAPSHOT_TYPE_TEMPLATE = 1

/** 快照类型 */
type SnapshotType = typeof SNAPSHOT_TYPE_USER | typeof SNAPSHOT_TYPE_TEMPLATE

/** 快照类型 Tab 配置 */
const SNAPSHOT_TYPE_TABS: { type: SnapshotType; label: string }[] = [
  { type: SNAPSHOT_TYPE_USER, label: '版本快照' },
  { type: SNAPSHOT_TYPE_TEMPLATE, label: '模板存档' },
]

/** 版本号最大字符数 */
const MAX_SNAPSHOT_VERSION_LENGTH = 50

/** 版本描述最大字符数 */
const MAX_SNAPSHOT_DESC_LENGTH = 100

/** 按版本聚合后的快照 */
interface SnapshotVersionGroup {
  /** 快照类型 */
  type: SnapshotType
  /** 版本号 */
  version: string
  /** 创建时间 */
  createdAt: string
  /** 版本描述 */
  desc: string
  /** 创建快照时的模板版本号 */
  tempVersion: string
  /** 该版本下的文件列表 */
  files: SnapshotFileItem[]
  /** 该版本下的文件树 */
  fileTree: SnapshotFileTreeNode
}

const projectStore = useProjectStore()
const buildContext = useBuildContext()

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

/** 还原版本预览弹窗可见性 */
const restoreDialogVisible = ref(false)

/** 还原计划预览加载中 */
const restorePreviewLoading = ref(false)

/** 正在预览还原的版本号 */
const restorePreviewVersion = ref('')

/** 正在还原的快照分组 key */
const restoringVersion = ref('')

/** 当前待还原的快照分组 key */
const pendingRestoreGroupKey = ref('')

/** 当前还原计划 */
const restorePlan = ref<SnapshotRestorePlan | null>(null)

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
  type: SNAPSHOT_TYPE_USER as SnapshotType,
})

/** 全部快照分组（含两种 type） */
const allVersionGroups = ref<SnapshotVersionGroup[]>([])

/** 当前选中的快照类型 Tab */
const activeSnapshotType = ref<SnapshotType>(SNAPSHOT_TYPE_USER)

/** 当前展开的版本号 */
const expandedVersions = ref<Set<string>>(new Set())

/** 目录展开状态，key 为「版本:路径」 */
const expandedDirs = ref<Record<string, boolean>>({})

/** 当前项目 ID */
const projectId = computed(() => projectStore.currentProject?.id ?? 0)

/** 当前 Tab 下展示的快照分组 */
const displayedVersionGroups = computed(() =>
  allVersionGroups.value.filter((group) => group.type === activeSnapshotType.value),
)

/**
 * 获取指定类型的快照数量
 * @param type 快照类型
 */
function getSnapshotCountByType(type: SnapshotType) {
  return allVersionGroups.value.filter((group) => group.type === type).length
}

/** 当前 Tab 快照版本数量 */
const currentSnapshotCount = computed(() => getSnapshotCountByType(activeSnapshotType.value))

/** 当前 Tab 是否已达数量上限 */
const isSnapshotLimitReached = computed(() => currentSnapshotCount.value >= MAX_SNAPSHOT_COUNT)

/** 当前 Tab 配置 */
const activeSnapshotTab = computed(
  () => SNAPSHOT_TYPE_TABS.find((tab) => tab.type === activeSnapshotType.value) ?? SNAPSHOT_TYPE_TABS[0]!,
)

/**
 * 生成快照分组唯一 key（type + 版本号）
 * @param type 快照类型
 * @param version 版本号
 */
function getVersionGroupKey(type: SnapshotType, version: string) {
  return `${type}:${version}`
}

/** 当前线上版本号 */
const onlineVersion = ref('')

/** 当前线上版本描述 */
const onlineVersionDesc = ref('')

/**
 * 判断版本是否为当前线上版本
 * @param version 版本号
 */
function isOnlineVersion(version: string) {
  const current = onlineVersion.value.trim()
  if (!current) return false
  return version.trim() === current
}

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
    const mapKey = getVersionGroupKey(item.type, item.version)
    const existing = map.get(mapKey)
    if (existing) {
      existing.files.push(item)
      continue
    }

    map.set(mapKey, {
      type: item.type,
      version: item.version,
      createdAt: item.createdAt,
      desc: item.desc,
      tempVersion: item.tempVersion?.trim() ?? '',
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
 * @param groupKey 快照分组 key
 * @param fileTree 文件树
 */
function initVersionTreeExpanded(groupKey: string, fileTree: SnapshotFileTreeNode) {
  const hasInitialized = Object.keys(expandedDirs.value).some((key) => key.startsWith(`${groupKey}:`))
  if (hasInitialized) return

  for (const child of fileTree.children ?? []) {
    if (child.type === 'directory') {
      expandedDirs.value[getSnapshotDirExpandKey(groupKey, child.path)] = true
    }
  }
}

/**
 * 切换目录展开状态
 * @param groupKey 快照分组 key
 * @param path 目录路径
 */
function toggleDirectory(groupKey: string, path: string) {
  const key = getSnapshotDirExpandKey(groupKey, path)
  expandedDirs.value[key] = !expandedDirs.value[key]
}

/**
 * 切换版本折叠面板
 * @param group 快照分组
 */
function toggleVersion(group: SnapshotVersionGroup) {
  const groupKey = getVersionGroupKey(group.type, group.version)
  const next = new Set(expandedVersions.value)
  if (next.has(groupKey)) {
    next.delete(groupKey)
  } else {
    next.add(groupKey)
    initVersionTreeExpanded(groupKey, group.fileTree)
  }
  expandedVersions.value = next
}

/**
 * 判断版本是否展开
 * @param group 快照分组
 */
function isVersionExpanded(group: SnapshotVersionGroup) {
  return expandedVersions.value.has(getVersionGroupKey(group.type, group.version))
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
    allVersionGroups.value = groupSnapshotsByVersion(files, projectStore.projectDirPath)
    buildContext.setSnapshotVersionCount(getSnapshotCountByType(SNAPSHOT_TYPE_USER))
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    listLoading.value = false
  }
}

/**
 * 加载当前线上版本信息
 */
async function loadOnlineVersion() {
  const currentProjectId = projectId.value
  if (!currentProjectId) {
    onlineVersion.value = ''
    onlineVersionDesc.value = ''
    return
  }

  try {
    const result = await getProjectVersion({ projectId: currentProjectId })
    onlineVersion.value = result.version?.trim() ?? ''
    onlineVersionDesc.value = result.desc?.trim() ?? ''
  } catch {
    onlineVersion.value = ''
    onlineVersionDesc.value = ''
    // 错误提示由 axios 拦截器统一处理
  }
}

/**
 * 删除版本快照
 * @param group 快照分组
 */
async function handleDeleteVersion(group: SnapshotVersionGroup) {
  const currentProjectId = projectId.value
  if (!currentProjectId) return

  const { version, type } = group
  const groupKey = getVersionGroupKey(type, version)

  if (isOnlineVersion(version)) {
    ElMessage.warning('已上线版本不可删除')
    return
  }

  try {
    await ElMessageBox.confirm(`确定要删除版本「${version}」吗？删除后不可恢复。`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    deletingVersion.value = groupKey
    await deleteSnapshot({
      projectId: currentProjectId,
      version,
    })

    const nextExpandedVersions = new Set(expandedVersions.value)
    nextExpandedVersions.delete(groupKey)
    expandedVersions.value = nextExpandedVersions

    const nextExpandedDirs = { ...expandedDirs.value }
    for (const key of Object.keys(nextExpandedDirs)) {
      if (key.startsWith(`${groupKey}:`)) {
        delete nextExpandedDirs[key]
      }
    }
    expandedDirs.value = nextExpandedDirs

    ElMessage.success('删除成功')
    await loadSnapshotList()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    // 错误提示由 axios 拦截器统一处理
  } finally {
    deletingVersion.value = ''
  }
}

/**
 * 迁移版本展开状态（版本号变更时使用）
 * @param type 快照类型
 * @param oldVersion 旧版本号
 * @param newVersion 新版本号
 */
function migrateVersionState(type: SnapshotType, oldVersion: string, newVersion: string) {
  if (oldVersion === newVersion) return

  const oldKey = getVersionGroupKey(type, oldVersion)
  const newKey = getVersionGroupKey(type, newVersion)

  if (expandedVersions.value.has(oldKey)) {
    const nextExpandedVersions = new Set(expandedVersions.value)
    nextExpandedVersions.delete(oldKey)
    nextExpandedVersions.add(newKey)
    expandedVersions.value = nextExpandedVersions
  }

  const nextExpandedDirs = { ...expandedDirs.value }
  for (const key of Object.keys(nextExpandedDirs)) {
    if (!key.startsWith(`${oldKey}:`)) continue
    const path = key.slice(oldKey.length + 1)
    const expanded = nextExpandedDirs[key]
    if (expanded === undefined) continue
    nextExpandedDirs[getSnapshotDirExpandKey(newKey, path)] = expanded
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
    type: group.type,
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

  if (
    version !== oldVersion
    && allVersionGroups.value.some((group) => group.type === editForm.value.type && group.version === version)
  ) {
    ElMessage.warning('该版本号已存在')
    return
  }

  const currentProjectId = projectId.value
  if (!currentProjectId) {
    ElMessage.warning('当前项目未就绪')
    return
  }

  const desc = editForm.value.desc.trim()

  editing.value = true
  try {
    await updateSnapshot({
      projectId: currentProjectId,
      oldVersion,
      version,
      desc,
    })

    migrateVersionState(editForm.value.type, oldVersion, version)
    editDialogVisible.value = false
    await loadSnapshotList()
    await loadOnlineVersion()
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    editing.value = false
  }
}

/**
 * 打开保存快照弹窗
 */
function openSaveDialog() {
  if (isSnapshotLimitReached.value) {
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

  if (isSnapshotLimitReached.value) {
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
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    saving.value = false
  }
}

/**
 * 打开还原版本预览弹窗
 * @param group 版本快照分组
 */
async function openRestoreDialog(group: SnapshotVersionGroup) {
  const currentProjectId = projectId.value
  if (!currentProjectId) {
    ElMessage.warning('当前项目未就绪')
    return
  }

  let projectDirPath = ''
  try {
    projectDirPath = projectStore.requireProjectDirPath()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目目录未就绪')
    return
  }

  restorePreviewLoading.value = true
  restorePreviewVersion.value = getVersionGroupKey(group.type, group.version)
  pendingRestoreGroupKey.value = restorePreviewVersion.value
  restorePlan.value = null
  restoreDialogVisible.value = true

  try {
    const [snapshotList, currentFiles] = await Promise.all([
      getSnapshotList({ projectId: currentProjectId }),
      fetchProjectTempFileList(),
    ])

    const versionSnapshotFiles = snapshotList.filter(
      (item) => item.version === group.version && item.type === group.type,
    )
    if (!versionSnapshotFiles.length) {
      ElMessage.warning('该版本快照不存在或已被删除')
      restoreDialogVisible.value = false
      return
    }

    restorePlan.value = await buildSnapshotRestorePlan(
      group.version,
      versionSnapshotFiles,
      currentFiles,
      projectDirPath,
    )
  } catch {
    restoreDialogVisible.value = false
    // 错误提示由 axios 拦截器统一处理
  } finally {
    restorePreviewLoading.value = false
    restorePreviewVersion.value = ''
  }
}

/**
 * 确认执行版本还原
 */
async function handleConfirmRestore() {
  const plan = restorePlan.value
  if (!plan) return

  if (!hasSnapshotRestoreChanges(plan)) {
    ElMessage.info('当前项目已与该版本一致，无需还原')
    restoreDialogVisible.value = false
    return
  }

  const project = projectStore.currentProject
  if (!project) {
    ElMessage.warning('当前项目未就绪')
    return
  }

  let projectDirPath = ''
  try {
    projectDirPath = projectStore.requireProjectDirPath()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目目录未就绪')
    return
  }

  restoringVersion.value = pendingRestoreGroupKey.value
  try {
    await executeSnapshotRestore(plan, projectDirPath, {
      id: project.id,
      title: project.title,
      desc: project.desc,
    })
    ElMessage.success(`版本「${plan.version}」还原成功`)
    restoreDialogVisible.value = false
    restorePlan.value = null
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    restoringVersion.value = ''
  }
}

onMounted(() => {
  void loadSnapshotList()
  void loadOnlineVersion()
})

watch(
  () => projectId.value,
  (currentProjectId) => {
    if (!currentProjectId) {
      onlineVersion.value = ''
      onlineVersionDesc.value = ''
      return
    }
    void loadOnlineVersion()
  },
)

watch(
  () => buildContext.buildCompletedSignal.value,
  () => {
    void loadSnapshotList()
    void loadOnlineVersion()
  },
)
</script>

<template>
  <div v-loading="listLoading" class="snapshot-panel">
    <div class="snapshot-panel-header">
      <div class="snapshot-panel-title-group">
        <h1 class="snapshot-panel-title">版本</h1>
        <span
          class="snapshot-panel-count-tag"
          :class="{ 'snapshot-panel-count-tag--limit': isSnapshotLimitReached }"
        >
          <span class="snapshot-panel-count-current">{{ currentSnapshotCount }}</span>
          <span class="snapshot-panel-count-sep">/</span>
          <span class="snapshot-panel-count-max">{{ MAX_SNAPSHOT_COUNT }}</span>
        </span>
      </div>
      <div class="snapshot-panel-header-action">
        <button
          type="button"
          class="snapshot-panel-save-btn"
          :class="{ 'snapshot-panel-save-btn--hidden': activeSnapshotType !== SNAPSHOT_TYPE_USER }"
          :tabindex="activeSnapshotType === SNAPSHOT_TYPE_USER ? 0 : -1"
          :aria-hidden="activeSnapshotType !== SNAPSHOT_TYPE_USER"
          @click="openSaveDialog"
        >
          <el-icon class="snapshot-panel-save-icon">
            <Camera />
          </el-icon>
          <span class="snapshot-panel-save-text">保存当前版本</span>
        </button>
      </div>
    </div>

    <div class="snapshot-panel-type-tabs">
      <button
        v-for="tab in SNAPSHOT_TYPE_TABS"
        :key="tab.type"
        type="button"
        class="snapshot-panel-type-tab"
        :class="{ 'snapshot-panel-type-tab--active': activeSnapshotType === tab.type }"
        @click="activeSnapshotType = tab.type"
      >
        <span class="snapshot-panel-type-tab-label">{{ tab.label }}</span>
        <span
          class="snapshot-panel-type-tab-count"
          :class="{ 'snapshot-panel-type-tab-count--limit': getSnapshotCountByType(tab.type) >= MAX_SNAPSHOT_COUNT }"
        >
          {{ getSnapshotCountByType(tab.type) }}/{{ MAX_SNAPSHOT_COUNT }}
        </span>
      </button>
    </div>
    <div v-if="onlineVersion" class="snapshot-panel-online">
      <div class="snapshot-panel-online-header">
        <span class="snapshot-panel-online-badge">线上</span>
        <span class="snapshot-panel-online-label">当前线上版本</span>
      </div>
      <span class="snapshot-panel-online-version">{{ onlineVersion }}</span>
      <p v-if="onlineVersionDesc" class="snapshot-panel-online-desc">{{ onlineVersionDesc }}</p>
    </div>
    <div v-if="!listLoading && displayedVersionGroups.length === 0" class="snapshot-panel-empty">
      暂无{{ activeSnapshotTab.label }}
    </div>
    <ul v-else class="snapshot-panel-list">
      <li
        v-for="group in displayedVersionGroups"
        :key="getVersionGroupKey(group.type, group.version)"
        class="snapshot-panel-group"
      >
        <div class="snapshot-panel-toggle">
          <button type="button" class="snapshot-panel-toggle-main" @click="toggleVersion(group)">
            <div class="snapshot-panel-summary">
              <div class="snapshot-panel-version-row">
                <span class="snapshot-panel-version">{{ group.version }}</span>
                <span v-if="isOnlineVersion(group.version)" class="snapshot-panel-online-tag">已上线</span>
                <span v-if="group.tempVersion" class="snapshot-panel-temp-tag">模板 {{ group.tempVersion }}</span>
              </div>
              <span class="snapshot-panel-time">{{ formatCreatedAt(group.createdAt) }}</span>
            </div>
          </button>
          <div class="snapshot-operation-container">
            <el-tooltip content="还原" placement="top" :show-after="200">
              <span class="snapshot-panel-tooltip-trigger">
                <button
                  type="button"
                  class="snapshot-panel-restore-btn"
                  :disabled="
                    restorePreviewVersion === getVersionGroupKey(group.type, group.version)
                    || restoringVersion === getVersionGroupKey(group.type, group.version)
                  "
                  aria-label="还原版本快照"
                  @click="openRestoreDialog(group)"
                >
                  <el-icon class="snapshot-panel-restore-icon">
                    <RefreshLeft />
                  </el-icon>
                </button>
              </span>
            </el-tooltip>
            <el-tooltip content="编辑" placement="top" :show-after="200">
              <button type="button" class="snapshot-panel-edit-btn" aria-label="编辑版本快照" @click="openEditDialog(group)">
                <el-icon class="snapshot-panel-edit-icon">
                  <Edit />
                </el-icon>
              </button>
            </el-tooltip>
            <el-tooltip :content="isOnlineVersion(group.version) ? '已上线版本不可删除' : '删除'" placement="top"
              :show-after="200">
              <span class="snapshot-panel-tooltip-trigger">
                <button
                  type="button"
                  class="snapshot-panel-delete-btn"
                  :disabled="
                    deletingVersion === getVersionGroupKey(group.type, group.version)
                    || isOnlineVersion(group.version)
                  "
                  aria-label="删除版本快照"
                  @click="handleDeleteVersion(group)"
                >
                  <el-icon class="snapshot-panel-delete-icon">
                    <Delete />
                  </el-icon>
                </button>
              </span>
            </el-tooltip>
            <button type="button" class="snapshot-panel-expand-btn" aria-label="展开或收起版本快照"
              @click="toggleVersion(group)">
              <SvgIcon name="chevron-down" class="snapshot-panel-arrow"
                :class="{ 'snapshot-panel-arrow--expanded': isVersionExpanded(group) }" />
            </button>
          </div>
        </div>
        <div v-show="isVersionExpanded(group)" class="snapshot-panel-detail">
          <p v-if="group.desc" class="snapshot-panel-desc">{{ group.desc }}</p>
          <div v-if="group.fileTree.children?.length" class="snapshot-panel-file-tree">
            <ul class="file-tree">
              <li v-for="node in group.fileTree.children" :key="node.path" class="file-tree-node">
                <SnapshotFileTreeBranch
                  :version="getVersionGroupKey(group.type, group.version)"
                  :node="node"
                  :depth="0"
                  :expanded-dirs="expandedDirs"
                  @dir-toggle="toggleDirectory(getVersionGroupKey(group.type, group.version), $event)"
                />
              </li>
            </ul>
          </div>
          <div v-else class="snapshot-panel-file-tree-empty">暂无文件</div>
        </div>
      </li>
    </ul>

    <el-dialog v-model="restoreDialogVisible" title="还原版本" width="32rem" append-to-body>
      <div v-loading="restorePreviewLoading" class="snapshot-restore-dialog">
        <template v-if="restorePlan">
          <p class="snapshot-restore-summary">
            将版本「{{ restorePlan.version }}」还原到当前项目：
            <strong>{{ restorePlan.unchanged.length }}</strong> 个不变，
            <strong>{{ restorePlan.deleted.length }}</strong> 个删除，
            <strong>{{ restorePlan.added.length }}</strong> 个新增，
            <strong>{{ restorePlan.overwritten.length }}</strong> 个覆盖
          </p>
          <p v-if="!hasSnapshotRestoreChanges(restorePlan)" class="snapshot-restore-empty">
            当前项目已与该版本一致，无需还原。
          </p>
          <div v-if="restorePlan.deleted.length" class="snapshot-restore-section">
            <h4 class="snapshot-restore-section-title snapshot-restore-section-title--delete">删除 ({{
              restorePlan.deleted.length }})</h4>
            <ul class="snapshot-restore-file-list">
              <li v-for="item in restorePlan.deleted" :key="`delete-${item.relativePath}`">{{ item.relativePath }}</li>
            </ul>
          </div>
          <div v-if="restorePlan.added.length" class="snapshot-restore-section">
            <h4 class="snapshot-restore-section-title snapshot-restore-section-title--add">新增 ({{
              restorePlan.added.length }})</h4>
            <ul class="snapshot-restore-file-list">
              <li v-for="item in restorePlan.added" :key="`add-${item.relativePath}`">
                {{ item.relativePath }}
                <SnapshotRestoreDiff mode="added" :target-lines="item.targetLines" />
              </li>
            </ul>
          </div>
          <div v-if="restorePlan.overwritten.length" class="snapshot-restore-section">
            <h4 class="snapshot-restore-section-title snapshot-restore-section-title--overwrite">覆盖 ({{
              restorePlan.overwritten.length }})</h4>
            <ul class="snapshot-restore-file-list">
              <li v-for="item in restorePlan.overwritten" :key="`overwrite-${item.relativePath}`">
                {{ item.relativePath }}
                <SnapshotRestoreDiff mode="overwrite" :current-lines="item.currentLines"
                  :target-lines="item.targetLines" :current-bytes="item.currentBytes"
                  :target-bytes="item.targetBytes" />
              </li>
            </ul>
          </div>
          <div v-if="restorePlan.unchanged.length" class="snapshot-restore-section">
            <h4 class="snapshot-restore-section-title">不变 ({{ restorePlan.unchanged.length }})</h4>
            <ul class="snapshot-restore-file-list snapshot-restore-file-list--muted">
              <li v-for="item in restorePlan.unchanged" :key="`unchanged-${item.relativePath}`">{{ item.relativePath }}
              </li>
            </ul>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="restoreDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="!!restoringVersion"
          :disabled="restorePreviewLoading || !restorePlan || !hasSnapshotRestoreChanges(restorePlan)"
          @click="handleConfirmRestore">
          确认还原
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" title="编辑版本快照" width="26rem" append-to-body>
      <el-form label-position="top">
        <el-form-item label="版本号" required>
          <el-input v-model="editForm.version" placeholder="请输入版本号，如 v1.0.0" :maxlength="MAX_SNAPSHOT_VERSION_LENGTH"
            show-word-limit clearable />
        </el-form-item>
        <el-form-item label="版本描述">
          <el-input v-model="editForm.desc" type="textarea" :rows="3" placeholder="请输入版本描述（选填）"
            :maxlength="MAX_SNAPSHOT_DESC_LENGTH" show-word-limit />
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
          <el-input v-model="saveForm.version" placeholder="请输入版本号，如 v1.0.0" :maxlength="MAX_SNAPSHOT_VERSION_LENGTH"
            show-word-limit clearable />
        </el-form-item>
        <el-form-item label="版本描述">
          <el-input v-model="saveForm.desc" type="textarea" :rows="3" placeholder="请输入版本描述（选填）"
            :maxlength="MAX_SNAPSHOT_DESC_LENGTH" show-word-limit />
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
  --snapshot-radius-sm: 2px;
  --snapshot-radius-md: 4px;

  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.snapshot-panel::-webkit-scrollbar {
  display: none;
}

.snapshot-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
  margin-bottom: 0.75rem;
}

.snapshot-panel-header-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 8.75rem;
  height: 2rem;
}

.snapshot-panel-type-tabs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.125rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--snapshot-group-border);
}

.snapshot-panel-type-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid transparent;
  border-radius: var(--snapshot-radius-md);
  background: transparent;
  color: var(--snapshot-accent-text-muted);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  box-sizing: border-box;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.snapshot-panel-type-tab:hover {
  background: var(--snapshot-accent-bg);
  color: var(--snapshot-accent-text);
}

.snapshot-panel-type-tab--active {
  background: var(--snapshot-accent-bg);
  border-color: var(--snapshot-accent-border);
  color: var(--snapshot-accent-text);
}

.snapshot-panel-type-tab-label {
  line-height: 1.2;
}

.snapshot-panel-type-tab-count {
  display: inline-flex;
  align-items: center;
  padding: 0.0625rem 0.375rem;
  border-radius: var(--snapshot-radius-sm);
  background: var(--snapshot-count-tag-bg);
  border: 1px solid var(--snapshot-count-tag-border);
  color: var(--snapshot-count-tag-current);
  font-size: 0.6875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.snapshot-panel-type-tab-count--limit {
  border-color: var(--snapshot-count-tag-limit-border);
  background: var(--snapshot-count-tag-limit-bg);
  color: var(--snapshot-count-tag-limit-current);
}

.snapshot-panel-online {
  margin-bottom: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--snapshot-online-border);
  border-left: 4px solid var(--snapshot-online-accent);
  border-radius: var(--snapshot-radius-md);
  background: var(--snapshot-online-bg);
  box-shadow: var(--snapshot-online-shadow);
}

.snapshot-panel-online-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.snapshot-panel-online-badge {
  flex-shrink: 0;
  padding: 0.125rem 0.4375rem;
  border-radius: var(--snapshot-radius-sm);
  background-color: var(--snapshot-online-badge-bg);
  color: var(--snapshot-online-accent);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.2;
}

.snapshot-panel-online-label {
  font-size: 0.75rem;
  color: var(--snapshot-online-label);
}

.snapshot-panel-online-version {
  display: block;
  font-size: 1rem;
  font-weight: 700;
  color: var(--snapshot-online-version);
  line-height: 1.35;
}

.snapshot-panel-online-desc {
  margin: 0.375rem 0 0;
  font-size: 0.8125rem;
  color: var(--snapshot-online-desc);
  line-height: 1.45;
}

.snapshot-panel-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.snapshot-panel-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
  line-height: 1.2;
}

.snapshot-panel-count-tag {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0.0625rem;
  padding: 0.1875rem 0.5625rem;
  border: 1px solid var(--snapshot-count-tag-border);
  border-radius: var(--snapshot-radius-sm);
  background: var(--snapshot-count-tag-bg);
  color: var(--snapshot-count-tag-text);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  box-shadow: var(--snapshot-count-tag-shadow);
}

.snapshot-panel-count-current {
  color: var(--snapshot-count-tag-current);
  font-weight: 700;
}

.snapshot-panel-count-sep {
  margin: 0 0.0625rem;
  color: var(--snapshot-count-tag-sep);
  font-weight: 500;
}

.snapshot-panel-count-max {
  color: var(--snapshot-count-tag-max);
  font-weight: 600;
}

.snapshot-panel-count-tag--limit {
  border-color: var(--snapshot-count-tag-limit-border);
  background: var(--snapshot-count-tag-limit-bg);
  color: var(--snapshot-count-tag-limit-text);
}

.snapshot-panel-count-tag--limit .snapshot-panel-count-current {
  color: var(--snapshot-count-tag-limit-current);
}

.snapshot-panel-count-tag--limit .snapshot-panel-count-sep,
.snapshot-panel-count-tag--limit .snapshot-panel-count-max {
  color: var(--snapshot-count-tag-limit-muted);
}

.snapshot-panel-save-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  width: 100%;
  height: 2rem;
  padding: 0 0.625rem;
  border: 1px solid var(--snapshot-accent-border);
  border-radius: var(--snapshot-radius-md);
  background: var(--snapshot-accent-bg);
  color: var(--snapshot-accent-text);
  font-size: 0.875rem;
  line-height: 1;
  cursor: pointer;
  opacity: 1;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.15s ease;
}

.snapshot-panel-save-btn--hidden {
  opacity: 0;
  pointer-events: none;
  cursor: default;
}

.snapshot-panel-save-btn:hover:not(.snapshot-panel-save-btn--hidden) {
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
  border-radius: var(--snapshot-radius-md);
  overflow: hidden;
}

.snapshot-panel-group+.snapshot-panel-group {
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

.snapshot-panel-version-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.snapshot-panel-online-tag {
  flex-shrink: 0;
  padding: 0.125rem 0.5rem;
  border-radius: var(--snapshot-radius-sm);
  background-color: var(--snapshot-online-tag-bg);
  color: var(--snapshot-online-tag-text);
  border: 1px solid var(--snapshot-online-tag-border);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
}

.snapshot-panel-temp-tag {
  flex-shrink: 0;
  padding: 0.125rem 0.5rem;
  border-radius: var(--snapshot-radius-sm);
  background-color: var(--snapshot-temp-tag-bg);
  color: var(--snapshot-temp-tag-text);
  border: 1px solid var(--snapshot-temp-tag-border);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
}

.snapshot-operation-container {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  padding-right: 0.75rem;
}

/** 禁用按钮外包一层，保证 tooltip 在 disabled 时仍可触发 */
.snapshot-panel-tooltip-trigger {
  display: inline-flex;
  align-items: center;
}

.snapshot-panel-edit-btn,
.snapshot-panel-restore-btn,
.snapshot-panel-delete-btn,
.snapshot-panel-expand-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: var(--snapshot-radius-sm);
  background: transparent;
  color: var(--snapshot-accent-text-muted);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.snapshot-panel-edit-btn:hover,
.snapshot-panel-restore-btn:hover:not(:disabled),
.snapshot-panel-delete-btn:hover:not(:disabled),
.snapshot-panel-expand-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--snapshot-accent-text);
}

html.dark .snapshot-panel-edit-btn:hover,
html.dark .snapshot-panel-restore-btn:hover:not(:disabled),
html.dark .snapshot-panel-delete-btn:hover:not(:disabled),
html.dark .snapshot-panel-expand-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.snapshot-panel-edit-icon,
.snapshot-panel-restore-icon,
.snapshot-panel-delete-icon {
  font-size: 1rem;
  line-height: 1;
}

.snapshot-panel-edit-icon :deep(svg),
.snapshot-panel-restore-icon :deep(svg),
.snapshot-panel-delete-icon :deep(svg) {
  display: block;
}

.snapshot-panel-restore-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.snapshot-panel-restore-btn:hover:not(:disabled) {
  color: #67c23a;
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
  border-radius: var(--snapshot-radius-sm);
  background-color: var(--app-bg-muted);
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.snapshot-panel-file-tree::-webkit-scrollbar {
  display: none;
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
  border-radius: var(--snapshot-radius-sm);
  background-color: var(--app-bg-muted);
  color: var(--app-text-muted);
  font-size: 0.8125rem;
}

.snapshot-restore-dialog {
  min-height: 6rem;
}

.snapshot-restore-summary {
  margin: 0 0 1rem;
  color: var(--app-text-secondary);
  font-size: 0.875rem;
  line-height: 1.6;
}

.snapshot-restore-empty {
  margin: 0 0 1rem;
  color: var(--app-text-muted);
  font-size: 0.8125rem;
}

.snapshot-restore-section {
  margin-bottom: 0.875rem;
}

.snapshot-restore-section-title {
  margin: 0 0 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--app-text-primary);
}

.snapshot-restore-section-title--delete {
  color: var(--app-danger);
}

.snapshot-restore-section-title--add {
  color: #16a34a;
}

.snapshot-restore-section-title--overwrite {
  color: var(--app-accent);
}

.snapshot-restore-file-list {
  margin: 0;
  padding: 0.5rem 0.75rem;
  list-style: none;
  max-height: 8rem;
  overflow-y: auto;
  border: 1px solid var(--app-border);
  border-radius: var(--snapshot-radius-sm);
  background-color: var(--app-bg-muted);
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

.snapshot-restore-file-list::-webkit-scrollbar {
  width: 6px;
}

.snapshot-restore-file-list::-webkit-scrollbar-track {
  background: var(--app-scrollbar-track);
  border-radius: var(--snapshot-radius-sm);
}

.snapshot-restore-file-list::-webkit-scrollbar-thumb {
  background-color: var(--app-scrollbar-thumb);
  border-radius: var(--snapshot-radius-sm);
  border: 1px solid transparent;
  background-clip: padding-box;
}

.snapshot-restore-file-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--app-scrollbar-thumb-hover);
}

.snapshot-restore-file-list--muted {
  color: var(--app-text-muted);
}

.snapshot-restore-file-list li {
  font-size: 0.8125rem;
  line-height: 1.6;
  word-break: break-all;
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
  --snapshot-online-bg: linear-gradient(135deg, #f3fbf6 0%, #e8f7ef 100%);
  --snapshot-online-border: #b8e6cc;
  --snapshot-online-accent: #1a8f5c;
  --snapshot-online-badge-bg: #d8f3e4;
  --snapshot-online-label: #5a8a72;
  --snapshot-online-version: #0f5c3a;
  --snapshot-online-desc: #4a7a62;
  --snapshot-online-shadow: 0 2px 10px rgba(26, 143, 92, 0.1);
  --snapshot-online-tag-bg: #e8f7ef;
  --snapshot-online-tag-text: #0f6b42;
  --snapshot-online-tag-border: #7dccaa;
  --snapshot-count-tag-bg: linear-gradient(135deg, #eef4ff 0%, #e4edff 100%);
  --snapshot-count-tag-border: #c7daff;
  --snapshot-count-tag-text: #5b7fc7;
  --snapshot-count-tag-current: #1e4fa8;
  --snapshot-count-tag-sep: #8faee0;
  --snapshot-count-tag-max: #5b7fc7;
  --snapshot-count-tag-shadow: 0 1px 2px rgba(30, 79, 168, 0.08);
  --snapshot-count-tag-limit-bg: linear-gradient(135deg, #fff8eb 0%, #fff1d6 100%);
  --snapshot-count-tag-limit-border: #f5d08a;
  --snapshot-count-tag-limit-text: #b8820a;
  --snapshot-count-tag-limit-current: #d48806;
  --snapshot-count-tag-limit-muted: #c9973a;
  --snapshot-temp-tag-bg: #fff4e0;
  --snapshot-temp-tag-text: #b45309;
  --snapshot-temp-tag-border: #f0c060;
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
  --snapshot-online-bg: linear-gradient(135deg, #152820 0%, #1a3028 100%);
  --snapshot-online-border: #2d6b4a;
  --snapshot-online-accent: #3ecf8e;
  --snapshot-online-badge-bg: rgba(62, 207, 142, 0.15);
  --snapshot-online-label: #7ab89a;
  --snapshot-online-version: #b8efd4;
  --snapshot-online-desc: #8fbaa8;
  --snapshot-online-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  --snapshot-online-tag-bg: rgba(62, 207, 142, 0.22);
  --snapshot-online-tag-text: #3ecf8e;
  --snapshot-online-tag-border: rgba(62, 207, 142, 0.45);
  --snapshot-count-tag-bg: linear-gradient(135deg, #1a2744 0%, #223358 100%);
  --snapshot-count-tag-border: #3d5a8c;
  --snapshot-count-tag-text: #7a9fd4;
  --snapshot-count-tag-current: #9ec0ff;
  --snapshot-count-tag-sep: #5a7aad;
  --snapshot-count-tag-max: #7a9fd4;
  --snapshot-count-tag-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  --snapshot-count-tag-limit-bg: linear-gradient(135deg, #3d2e14 0%, #4a3818 100%);
  --snapshot-count-tag-limit-border: #8a6b2e;
  --snapshot-count-tag-limit-text: #e0b84a;
  --snapshot-count-tag-limit-current: #f5cc5c;
  --snapshot-count-tag-limit-muted: #c9a84a;
  --snapshot-temp-tag-bg: rgba(255, 193, 94, 0.22);
  --snapshot-temp-tag-text: #ffc15e;
  --snapshot-temp-tag-border: rgba(255, 193, 94, 0.45);
}
</style>
