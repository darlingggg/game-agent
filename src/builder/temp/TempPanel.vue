<script setup lang="ts">
import { Loading, QuestionFilled, Top } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useBuildContext } from '@/builder/build/buildContext'
import { syncTemplateUpgradeToPreview } from '@/builder/preview/previewSync'
import { PROJECT_FILES_CHANGED_EVENT } from '@/builder/snapshot/snapshotRestore'
import {
  getTempCurrentVersion,
  getTempLatestVersion,
  getTempVersionList,
  updateTemp,
  type fileItem,
  type versionItem,
} from '@/http/temp'
import { getSnapshotList } from '@/http/snapshot'
import { useProjectStore } from '@/stores/project'

defineOptions({
  name: 'TempPanel',
})

/** 模板存档最大保存数量 */
const MAX_TEMPLATE_ARCHIVE_COUNT = 5

/** 快照类型：模板更新前自动存档 */
const SNAPSHOT_TYPE_TEMPLATE = 1

const props = defineProps<{
  /** 面板是否处于激活 Tab */
  panelActive: boolean
}>()

/** 文件操作类型文案 */
const FILE_ACTION_LABEL: Record<fileItem['action'], string> = {
  add: '新增',
  update: '更新',
  delete: '删除',
}

const projectStore = useProjectStore()
const buildContext = useBuildContext()

/** 列表加载中 */
const listLoading = ref(false)

/** 更新模板中：latest 表示更新到最新，其他值为指定版本号 */
const updatingTarget = ref<'latest' | string | ''>('')

/** 当前项目模板版本 */
const currentVersion = ref('')

/** 模板最新版本 */
const latestVersion = ref('')

/** 模板版本列表（原始数据） */
const versionList = ref<versionItem[]>([])

/** 当前项目模板存档数量 */
const templateArchiveCount = ref(0)

/** 当前项目 ID */
const projectId = computed(() => projectStore.currentProject?.id ?? 0)

/** 是否已是最新版本 */
const isLatestVersion = computed(() => {
  const current = currentVersion.value.trim()
  const latest = latestVersion.value.trim()
  if (!current || !latest) return false
  return current === latest
})

/** 模板存档是否已达数量上限 */
const isTemplateArchiveLimitReached = computed(
  () => templateArchiveCount.value >= MAX_TEMPLATE_ARCHIVE_COUNT,
)

/** 「更新到最新」按钮是否禁用 */
const isUpdateToLatestDisabled = computed(
  () => isLatestVersion.value || isUpdating.value || listLoading.value || isTemplateArchiveLimitReached.value,
)

/** 「更新到最新」按钮悬浮提示 */
const updateToLatestTooltip = computed(() => {
  if (isTemplateArchiveLimitReached.value) {
    return `模板存档最多 ${MAX_TEMPLATE_ARCHIVE_COUNT} 个，请先删除旧存档后再升级`
  }
  if (isLatestVersion.value) return '已是最新模板版本'
  return '更新到最新版本'
})

/** 「更新到此版本」按钮悬浮提示 */
const updateToVersionTooltip = computed(() => {
  if (isTemplateArchiveLimitReached.value) {
    return `模板存档最多 ${MAX_TEMPLATE_ARCHIVE_COUNT} 个，请先删除旧存档后再升级`
  }
  return '更新到此版本'
})

/** 展示用的版本卡片数据 */
interface TempVersionCard {
  /** 版本号 */
  version: string
  /** 版本描述 */
  description: string
  /** 创建时间 */
  createdAt: string
  /** 文件变更列表 */
  files: fileItem[]
}

/** 展示用的版本卡片数据 */
const versionCards = computed(() => {
  return versionList.value
    .map((item) => normalizeVersionItem(item))
    .sort((a, b) => compareVersionCreatedAt(b.createdAt, a.createdAt))
})

/**
 * 从 list 接口项中提取版本卡片数据
 * @param item 模板版本项
 */
function normalizeVersionItem(item: versionItem): TempVersionCard {
  const content = item.content

  return {
    version: item.version,
    description: content?.description ?? '',
    createdAt: content?.createdAt ?? '',
    files: content?.files ?? [],
  }
}

/** 已展开文件列表的版本号 */
const expandedFileVersions = ref<Set<string>>(new Set())

/**
 * 判断版本文件列表是否展开
 * @param version 版本号
 */
function isFilesExpanded(version: string) {
  return expandedFileVersions.value.has(version)
}

/**
 * 切换版本文件列表展开状态
 * @param version 版本号
 */
function toggleFilesExpand(version: string) {
  const next = new Set(expandedFileVersions.value)
  if (next.has(version)) {
    next.delete(version)
  } else {
    next.add(version)
  }
  expandedFileVersions.value = next
}

/**
 * 同步默认展开状态：当前项目版本默认展开文件列表
 */
function syncDefaultExpandedFiles() {
  const current = currentVersion.value.trim()
  if (!current) return
  expandedFileVersions.value = new Set([current])
}

/**
 * 比较版本创建时间（降序）
 * @param a 时间 A
 * @param b 时间 B
 */
function compareVersionCreatedAt(a: string, b: string) {
  const timeA = new Date(a).getTime()
  const timeB = new Date(b).getTime()
  if (Number.isNaN(timeA) && Number.isNaN(timeB)) return 0
  if (Number.isNaN(timeA)) return 1
  if (Number.isNaN(timeB)) return -1
  return timeA - timeB
}

/**
 * 判断是否为当前项目模板版本
 * @param version 版本号
 */
function isCurrentProjectVersion(version: string) {
  const current = currentVersion.value.trim()
  if (!current) return false
  return version.trim() === current
}

/**
 * 解析版本号为数字数组（如 1.0.1 → [1, 0, 1]）
 * @param version 版本号
 */
function parseVersionParts(version: string) {
  return version.trim().split('.').map((part) => {
    const num = Number.parseInt(part, 10)
    return Number.isNaN(num) ? 0 : num
  })
}

/**
 * 比较两个版本号
 * @param a 版本 A
 * @param b 版本 B
 * @returns 大于 0 表示 A 高于 B，小于 0 表示 A 低于 B，等于 0 表示相同
 */
function compareVersions(a: string, b: string) {
  const partsA = parseVersionParts(a)
  const partsB = parseVersionParts(b)
  const maxLen = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < maxLen; i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 判断目标版本是否高于当前项目版本
 * @param version 目标版本号
 */
function isVersionHigherThanCurrent(version: string) {
  const current = currentVersion.value.trim()
  if (!current) return false
  return compareVersions(version, current) > 0
}

/** 是否正在更新模板 */
const isUpdating = computed(() => updatingTarget.value !== '')

/**
 * 格式化创建时间
 * @param value 接口返回时间
 */
function formatCreatedAt(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

/**
 * 加载当前项目模板存档数量
 */
async function loadTemplateArchiveCount() {
  const currentProjectId = projectId.value
  if (!currentProjectId) {
    templateArchiveCount.value = 0
    return
  }

  try {
    const list = await getSnapshotList({ projectId: currentProjectId })
    const versions = new Set(
      list.filter((item) => item.type === SNAPSHOT_TYPE_TEMPLATE).map((item) => item.version),
    )
    templateArchiveCount.value = versions.size
  } catch {
    // 错误提示由 axios 拦截器统一处理
  }
}

/**
 * 加载模板版本相关数据
 */
async function loadTempData() {
  const currentProjectId = projectId.value
  if (!currentProjectId) {
    currentVersion.value = ''
    latestVersion.value = ''
    versionList.value = []
    templateArchiveCount.value = 0
    return
  }

  listLoading.value = true
  try {
    const [currentRes, latestRes, listRes] = await Promise.all([
      getTempCurrentVersion({ projectId: currentProjectId }),
      getTempLatestVersion(),
      getTempVersionList(),
      loadTemplateArchiveCount(),
    ])

    currentVersion.value = currentRes.version ?? ''
    latestVersion.value = latestRes.version ?? ''
    versionList.value = listRes ?? []
    syncDefaultExpandedFiles()
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    listLoading.value = false
  }
}

/**
 * 执行模板更新
 * @param upToVersion 目标版本号，不传则更新到最新
 */
async function executeUpdateTemp(upToVersion?: string) {
  const currentProjectId = projectId.value
  if (!currentProjectId) {
    ElMessage.warning('当前项目未就绪')
    return
  }

  const targetVersion = upToVersion?.trim()
  if (targetVersion) {
    if (!isVersionHigherThanCurrent(targetVersion)) {
      ElMessage.warning('只能更新到高于当前版本的版本')
      return
    }
  } else if (isLatestVersion.value) {
    return
  }

  if (isTemplateArchiveLimitReached.value) {
    ElMessage.warning(`模板存档最多 ${MAX_TEMPLATE_ARCHIVE_COUNT} 个，请先删除旧存档后再升级`)
    return
  }

  updatingTarget.value = targetVersion || 'latest'
  try {
    await updateTemp({
      projectId: currentProjectId,
      ...(targetVersion ? { upToVersion: targetVersion } : {}),
    })
    ElMessage.success(targetVersion ? `模板已更新到版本 ${targetVersion}` : '模板已更新到最新版本')
    // 模板升级会自动创建快照，通知版本面板刷新列表
    buildContext.buildCompletedSignal.value += 1
    try {
      await syncTemplateUpgradeToPreview()
    } catch {
      // 预览刷新失败不阻断升级成功提示
    }
    window.dispatchEvent(new CustomEvent(PROJECT_FILES_CHANGED_EVENT))
    await loadTempData()
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    updatingTarget.value = ''
  }
}

/**
 * 更新项目模板到最新版本
 */
async function handleUpdateToLatest() {
  if (isLatestVersion.value || isUpdating.value) return

  if (isTemplateArchiveLimitReached.value) {
    ElMessage.warning(`模板存档最多 ${MAX_TEMPLATE_ARCHIVE_COUNT} 个，请先删除旧存档后再升级`)
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定将模板从 ${currentVersion.value || '-'} 更新到最新版本 ${latestVersion.value || '-'} 吗？`,
      '更新模板',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  await executeUpdateTemp()
}

/**
 * 更新项目模板到指定版本
 * @param targetVersion 目标版本号
 */
async function handleUpdateToVersion(targetVersion: string) {
  if (isUpdating.value) return

  if (isTemplateArchiveLimitReached.value) {
    ElMessage.warning(`模板存档最多 ${MAX_TEMPLATE_ARCHIVE_COUNT} 个，请先删除旧存档后再升级`)
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定将模板从 ${currentVersion.value || '-'} 更新到版本 ${targetVersion} 吗？`,
      '更新模板',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  await executeUpdateTemp(targetVersion)
}

/** 进入模板 Tab 时拉取数据 */
watch(
  () => props.panelActive,
  (active) => {
    if (!active) return
    void loadTempData()
  },
  { immediate: true },
)

/** 切换项目后，若面板处于激活状态则重新拉取 */
watch(
  () => projectId.value,
  () => {
    if (!props.panelActive) return
    void loadTempData()
  },
)

/** 版本列表变更后刷新模板存档数量 */
watch(
  () => buildContext.buildCompletedSignal.value,
  () => {
    if (!props.panelActive) return
    void loadTemplateArchiveCount()
  },
)
</script>

<template>
  <div v-loading="listLoading" class="temp-panel">
    <div class="temp-panel-header">
      <div class="temp-panel-title-group">
        <h1 class="temp-panel-title">项目模板</h1>
        <span v-if="currentVersion || latestVersion" class="temp-panel-version-tag">
          <span class="temp-panel-version-current">{{ currentVersion || '-' }}</span>
          <span class="temp-panel-version-sep">/</span>
          <span class="temp-panel-version-latest">{{ latestVersion || '-' }}</span>
        </span>
      </div>
      <el-tooltip :content="updateToLatestTooltip" placement="top" :show-after="200">
        <span class="temp-panel-tooltip-trigger">
          <button
            type="button"
            class="temp-panel-update-btn"
            :class="{
              'temp-panel-update-btn--disabled': isLatestVersion || isTemplateArchiveLimitReached,
              'temp-panel-update-btn--loading': updatingTarget === 'latest',
            }"
            :disabled="isUpdateToLatestDisabled"
            @click="handleUpdateToLatest"
          >
            <el-icon class="temp-panel-update-icon">
              <Loading v-if="updatingTarget === 'latest'" />
              <Top v-else />
            </el-icon>
            <span class="temp-panel-update-text">
              {{ isLatestVersion ? '已是最新' : updatingTarget === 'latest' ? '更新中...' : '更新到最新' }}
            </span>
          </button>
        </span>
      </el-tooltip>
    </div>

    <div v-if="!listLoading && versionCards.length === 0" class="temp-panel-empty">暂无模板版本</div>

    <template v-else-if="!listLoading">
      <div v-if="isLatestVersion && currentVersion" class="temp-panel-tip">
        当前已是最新模板版本，无需更新
      </div>

      <ul class="temp-panel-list">
      <li
        v-for="card in versionCards"
        :key="card.version"
        class="temp-panel-card"
        :class="{
          'temp-panel-card--current': isCurrentProjectVersion(card.version),
          'temp-panel-card--latest': card.version === latestVersion,
        }"
      >
        <div class="temp-panel-card-header">
          <div class="temp-panel-card-title-row">
            <span class="temp-panel-card-version">{{ card.version }}</span>
            <el-tooltip
              v-if="card.description"
              :content="card.description"
              placement="top"
              :show-after="200"
            >
              <span class="temp-panel-desc-trigger" tabindex="0" role="button" aria-label="版本说明">
                <el-icon><QuestionFilled /></el-icon>
              </span>
            </el-tooltip>
            <span v-if="isCurrentProjectVersion(card.version)" class="temp-panel-status-tag temp-panel-status-tag--current">当前</span>
            <span v-if="card.version === latestVersion" class="temp-panel-status-tag temp-panel-status-tag--latest">
              <span class="temp-panel-status-dot" aria-hidden="true"></span>
              最新
            </span>
          </div>
          <div class="temp-panel-card-actions">
            <span class="temp-panel-card-time">{{ formatCreatedAt(card.createdAt) }}</span>
            <el-tooltip :content="updateToVersionTooltip" placement="top" :show-after="200">
              <span class="temp-panel-tooltip-trigger">
                <button
                  v-if="isVersionHigherThanCurrent(card.version)"
                  type="button"
                  class="temp-panel-card-update-btn"
                  :class="{
                    'temp-panel-card-update-btn--loading': updatingTarget === card.version,
                    'temp-panel-card-update-btn--disabled': isTemplateArchiveLimitReached,
                  }"
                  :disabled="isUpdating || listLoading || isTemplateArchiveLimitReached"
                  @click="handleUpdateToVersion(card.version)"
                >
                  <el-icon v-if="updatingTarget === card.version" class="temp-panel-card-update-icon">
                    <Loading />
                  </el-icon>
                  {{ updatingTarget === card.version ? '更新中...' : '更新到此版本' }}
                </button>
              </span>
            </el-tooltip>
          </div>
        </div>

        <div
          v-if="card.files.length"
          class="temp-panel-files-section"
          :class="{ 'temp-panel-files-section--expanded': isFilesExpanded(card.version) }"
        >
          <button type="button" class="temp-panel-files-toggle" @click="toggleFilesExpand(card.version)">
            <span class="temp-panel-files-toggle-left">
              <span class="temp-panel-files-toggle-label">文件变更</span>
              <span class="temp-panel-files-count">{{ card.files.length }}</span>
            </span>
            <svg
              class="temp-panel-files-arrow"
              :class="{ 'temp-panel-files-arrow--expanded': isFilesExpanded(card.version) }"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <div v-show="isFilesExpanded(card.version)" class="temp-panel-file-list">
            <div v-for="file in card.files" :key="`${card.version}-${file.path}`" class="temp-panel-file-item">
              <div class="temp-panel-file-main">
                <span class="temp-panel-file-path">{{ file.path }}</span>
                <span class="temp-panel-file-action" :class="`temp-panel-file-action--${file.action}`">
                  {{ FILE_ACTION_LABEL[file.action] }}
                </span>
              </div>
              <p v-if="file.description" class="temp-panel-file-desc">{{ file.description }}</p>
            </div>
          </div>
        </div>
        <div v-else class="temp-panel-file-empty">该版本无文件变更</div>
      </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
/* 浅色主题：与版本快照面板保持一致的克制风格 */
.temp-panel {
  --temp-accent-bg: #eef4ff;
  --temp-accent-bg-hover: #dbe8ff;
  --temp-accent-text: #1e4fa8;
  --temp-accent-text-muted: #5b7fc7;
  --temp-accent-border: #c7daff;
  --temp-accent-border-hover: #a3c4ff;
  --temp-group-border: var(--app-border);
  --temp-action-add-text: #1a8f5c;
  --temp-action-update-text: #1e4fa8;
  --temp-action-delete-text: #c0392b;
  --temp-latest-tag-bg: #fff4e0;
  --temp-latest-tag-text: #b45309;
  --temp-latest-tag-border: #f0c060;
  --temp-latest-header-bg: #fff9ed;
  --temp-radius-sm: 2px;
  --temp-radius-md: 4px;

  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* 深色主题 */
html.dark .temp-panel {
  --temp-accent-bg: #1a2744;
  --temp-accent-bg-hover: #223358;
  --temp-accent-text: #9ec0ff;
  --temp-accent-text-muted: #7a9fd4;
  --temp-accent-border: #2d4470;
  --temp-accent-border-hover: #3d5a8c;
  --temp-group-border: var(--app-border);
  --temp-action-add-text: #3ecf8e;
  --temp-action-update-text: #9ec0ff;
  --temp-action-delete-text: #ff8787;
  --temp-latest-tag-bg: rgba(255, 193, 94, 0.22);
  --temp-latest-tag-text: #ffc15e;
  --temp-latest-tag-border: rgba(255, 193, 94, 0.45);
  --temp-latest-header-bg: rgba(255, 193, 94, 0.1);
}

.temp-panel::-webkit-scrollbar {
  display: none;
}

.temp-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
  margin-bottom: 0.75rem;
}

.temp-panel-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex-wrap: wrap;
}

.temp-panel-tooltip-trigger {
  display: inline-flex;
}

.temp-panel-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
  line-height: 1.2;
}

.temp-panel-version-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.1875rem 0.5625rem;
  border: 1px solid var(--temp-accent-border);
  border-radius: var(--temp-radius-sm);
  background: var(--temp-accent-bg);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.temp-panel-version-current {
  color: var(--temp-accent-text);
  font-weight: 700;
}

.temp-panel-version-sep {
  margin: 0 0.0625rem;
  color: var(--temp-accent-text-muted);
  font-weight: 500;
}

.temp-panel-version-latest {
  color: var(--temp-accent-text-muted);
  font-weight: 600;
}

.temp-panel-update-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--temp-accent-border);
  border-radius: var(--temp-radius-md);
  background: var(--temp-accent-bg);
  color: var(--temp-accent-text);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.temp-panel-update-btn:hover:not(:disabled) {
  background: var(--temp-accent-bg-hover);
  border-color: var(--temp-accent-border-hover);
}

.temp-panel-update-btn:disabled,
.temp-panel-update-btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.temp-panel-update-btn--loading {
  cursor: wait;
}

.temp-panel-update-icon {
  flex-shrink: 0;
  font-size: 0.9375rem;
}

.temp-panel-update-icon :deep(svg) {
  display: block;
}

.temp-panel-update-btn--loading .temp-panel-update-icon {
  animation: temp-btn-spin 0.9s linear infinite;
}

@keyframes temp-btn-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.temp-panel-empty {
  color: var(--app-text-muted);
  font-size: 0.875rem;
}

.temp-panel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.temp-panel-card {
  border: 1px solid var(--temp-group-border);
  border-radius: var(--temp-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.temp-panel-card--current {
  border-color: var(--temp-accent-border);
}

.temp-panel-card--latest:not(.temp-panel-card--current) {
  border-color: var(--temp-latest-tag-border);
}

.temp-panel-card--latest:not(.temp-panel-card--current) .temp-panel-card-header {
  background: var(--temp-latest-header-bg);
}

.temp-panel-tip {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.625rem;
  border-radius: var(--temp-radius-sm);
  border: 1px solid var(--temp-group-border);
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  background: var(--app-bg-subtle);
  line-height: 1.45;
}

.temp-panel-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  background: var(--temp-accent-bg);
}

.temp-panel-card--current .temp-panel-card-header {
  border-bottom: 1px solid var(--temp-accent-border);
}

.temp-panel-card-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.temp-panel-card-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex-wrap: wrap;
}

.temp-panel-card-version {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--temp-accent-text);
  line-height: 1.35;
}

.temp-panel-desc-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  color: var(--temp-accent-text-muted);
  font-size: 0.875rem;
  cursor: help;
  transition: color 0.15s ease;
}

.temp-panel-desc-trigger:hover,
.temp-panel-desc-trigger:focus-visible {
  color: var(--temp-accent-text);
  outline: none;
}

.temp-panel-status-tag {
  flex-shrink: 0;
  padding: 0.125rem 0.4375rem;
  border-radius: var(--temp-radius-sm);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
}

.temp-panel-status-tag--current {
  background: var(--app-surface);
  border: 1px solid var(--temp-accent-border);
  color: var(--temp-accent-text);
}

.temp-panel-status-tag--latest {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  background: var(--temp-latest-tag-bg);
  border: 1px solid var(--temp-latest-tag-border);
  color: var(--temp-latest-tag-text);
  font-weight: 700;
}

.temp-panel-status-dot {
  flex-shrink: 0;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: currentColor;
}

.temp-panel-card-time {
  font-size: 0.75rem;
  color: var(--temp-accent-text-muted);
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.temp-panel-card-update-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3125rem;
  height: 1.625rem;
  padding: 0 0.5625rem;
  border: 1px solid var(--temp-accent-border);
  border-radius: var(--temp-radius-sm);
  background: var(--app-surface);
  color: var(--temp-accent-text);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.temp-panel-card-update-btn--loading {
  cursor: wait;
}

.temp-panel-card-update-icon {
  flex-shrink: 0;
  font-size: 0.875rem;
  animation: temp-btn-spin 0.9s linear infinite;
}

.temp-panel-card-update-icon :deep(svg) {
  display: block;
}

.temp-panel-card-update-btn:hover:not(:disabled) {
  background: var(--temp-accent-bg-hover);
  border-color: var(--temp-accent-border-hover);
}

.temp-panel-card-update-btn:disabled,
.temp-panel-card-update-btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.temp-panel-files-section {
  border-top: 1px solid var(--temp-group-border);
}

.temp-panel-files-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.875rem;
  border: none;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.temp-panel-files-toggle:hover {
  background: var(--app-bg-subtle);
}

.temp-panel-files-toggle-left {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.temp-panel-files-toggle-label {
  font-size: 0.8125rem;
  font-weight: 500;
}

.temp-panel-files-count {
  font-size: 0.75rem;
  color: var(--temp-accent-text-muted);
  font-variant-numeric: tabular-nums;
}

.temp-panel-files-count::before {
  content: '(';
}

.temp-panel-files-count::after {
  content: ')';
}

.temp-panel-files-arrow {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  color: var(--app-text-muted);
  transition: transform 0.2s ease;
}

.temp-panel-files-arrow--expanded {
  transform: rotate(180deg);
}

.temp-panel-file-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0 0.875rem 0.625rem;
  max-height: 16rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

.temp-panel-file-list::-webkit-scrollbar {
  width: 5px;
}

.temp-panel-file-list::-webkit-scrollbar-thumb {
  background-color: var(--app-scrollbar-thumb);
  border-radius: var(--temp-radius-sm);
}

.temp-panel-file-item {
  padding: 0.4375rem 0.5625rem;
  border-radius: var(--temp-radius-sm);
  background: var(--app-bg-subtle);
  border: 1px solid var(--temp-group-border);
}

.temp-panel-file-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.temp-panel-file-path {
  min-width: 0;
  font-size: 0.8125rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  color: var(--app-text-primary);
  word-break: break-all;
  line-height: 1.4;
}

.temp-panel-file-action {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.3;
}

.temp-panel-file-action--add {
  color: var(--temp-action-add-text);
}

.temp-panel-file-action--update {
  color: var(--temp-action-update-text);
}

.temp-panel-file-action--delete {
  color: var(--temp-action-delete-text);
}

.temp-panel-file-desc {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--app-text-muted);
  line-height: 1.4;
}

.temp-panel-file-empty {
  padding: 0.625rem 0.875rem;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  border-top: 1px solid var(--temp-group-border);
}
</style>
