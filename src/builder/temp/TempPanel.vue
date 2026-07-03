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
          <span class="temp-panel-version-current-label">当前</span>
          <span class="temp-panel-version-current">{{ currentVersion || '-' }}</span>
          <span class="temp-panel-version-sep">→</span>
          <span class="temp-panel-version-latest-label">最新</span>
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
        :class="{ 'temp-panel-card--current': isCurrentProjectVersion(card.version) }"
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
            <span v-if="isCurrentProjectVersion(card.version)" class="temp-panel-current-tag">当前项目</span>
            <span v-if="card.version === latestVersion" class="temp-panel-latest-tag">最新</span>
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
/* 浅色主题：模板面板浅蓝配色（与项目主色一致） */
.temp-panel {
  --temp-accent: #2463dc;
  --temp-accent-soft: #eef4ff;
  --temp-accent-soft-hover: #dbe8ff;
  --temp-accent-border: #c7daff;
  --temp-accent-text: #1e4fa8;
  --temp-card-border: #c7daff;
  --temp-card-bg: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
  --temp-card-current-border: #a3c4ff;
  --temp-card-current-bg: linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%);
  --temp-card-current-shadow: 0 4px 14px rgba(36, 99, 220, 0.1);
  --temp-current-tag-bg: #d8f3e4;
  --temp-current-tag-text: #1a8f5c;
  --temp-current-tag-border: #9edbb8;
  --temp-latest-tag-bg: #fff1d6;
  --temp-latest-tag-text: #c87a00;
  --temp-latest-tag-border: #f5c96a;
  --temp-version-current-bg: #e8f0ff;
  --temp-version-current-text: #1e4fa8;
  --temp-version-latest-bg: #fff3e0;
  --temp-version-latest-text: #c87a00;
  --temp-files-toggle-bg: #eef4ff;
  --temp-files-toggle-bg-hover: #dbe8ff;
  --temp-files-toggle-text: #1e4fa8;
  --temp-files-count-bg: #2463dc;
  --temp-files-count-text: #ffffff;
  --temp-file-item-bg: #ffffff;
  --temp-file-item-border: #dbe8ff;
  --temp-action-add-bg: #d8f3e4;
  --temp-action-add-text: #1a8f5c;
  --temp-action-update-bg: #e8f0ff;
  --temp-action-update-text: #1e4fa8;
  --temp-action-delete-bg: #ffe8e8;
  --temp-action-delete-text: #c0392b;
  --temp-update-btn-bg: linear-gradient(135deg, #3d7ae8 0%, #2463dc 100%);
  --temp-update-btn-bg-hover: linear-gradient(135deg, #2463dc 0%, #1e4fa8 100%);
  --temp-update-btn-text: #ffffff;
  --temp-update-btn-border: #2463dc;
  --temp-radius-sm: 2px;
  --temp-radius-md: 4px;
  --temp-shadow-sm: 0 1px 2px rgba(36, 99, 220, 0.06);
  --temp-shadow-md: 0 1px 3px rgba(36, 99, 220, 0.08), 0 1px 0 rgba(255, 255, 255, 0.65) inset;
  --temp-shadow-card: 0 1px 2px rgba(36, 99, 220, 0.05), 0 1px 0 rgba(255, 255, 255, 0.75) inset;
  --temp-shadow-card-current: 0 2px 6px rgba(36, 99, 220, 0.1), 0 1px 0 rgba(255, 255, 255, 0.6) inset;
  --temp-shadow-btn: 0 1px 2px rgba(36, 99, 220, 0.2), 0 1px 0 rgba(255, 255, 255, 0.15) inset;
  --temp-shadow-btn-hover: 0 2px 4px rgba(36, 99, 220, 0.24), 0 1px 0 rgba(255, 255, 255, 0.18) inset;
  --temp-inset-highlight: 0 1px 0 rgba(255, 255, 255, 0.55) inset;

  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* 深色主题：模板面板浅蓝暗色适配 */
html.dark .temp-panel {
  --temp-accent: #5b8cff;
  --temp-accent-soft: #1a2744;
  --temp-accent-soft-hover: #223358;
  --temp-accent-border: #2d4470;
  --temp-accent-text: #9ec0ff;
  --temp-card-border: #2d4470;
  --temp-card-bg: linear-gradient(135deg, #1c1f26 0%, #141c2e 100%);
  --temp-card-current-border: #3d5a8c;
  --temp-card-current-bg: linear-gradient(135deg, #141c2e 0%, #1a2744 100%);
  --temp-card-current-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  --temp-current-tag-bg: rgba(62, 207, 142, 0.18);
  --temp-current-tag-text: #3ecf8e;
  --temp-current-tag-border: rgba(62, 207, 142, 0.35);
  --temp-latest-tag-bg: rgba(255, 193, 94, 0.18);
  --temp-latest-tag-text: #ffc15e;
  --temp-latest-tag-border: rgba(255, 193, 94, 0.35);
  --temp-version-current-bg: rgba(91, 140, 255, 0.18);
  --temp-version-current-text: #9ec0ff;
  --temp-version-latest-bg: rgba(255, 193, 94, 0.18);
  --temp-version-latest-text: #ffc15e;
  --temp-files-toggle-bg: #1a2744;
  --temp-files-toggle-bg-hover: #223358;
  --temp-files-toggle-text: #9ec0ff;
  --temp-files-count-bg: #5b8cff;
  --temp-files-count-text: #ffffff;
  --temp-file-item-bg: #1c1f26;
  --temp-file-item-border: #2d4470;
  --temp-action-add-bg: rgba(62, 207, 142, 0.18);
  --temp-action-add-text: #3ecf8e;
  --temp-action-update-bg: rgba(91, 140, 255, 0.18);
  --temp-action-update-text: #9ec0ff;
  --temp-action-delete-bg: rgba(255, 135, 135, 0.18);
  --temp-action-delete-text: #ff8787;
  --temp-update-btn-bg: linear-gradient(135deg, #6b9aff 0%, #5b8cff 100%);
  --temp-update-btn-bg-hover: linear-gradient(135deg, #5b8cff 0%, #4a7ae8 100%);
  --temp-update-btn-text: #ffffff;
  --temp-update-btn-border: #5b8cff;
  --temp-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --temp-shadow-md: 0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.04) inset;
  --temp-shadow-card: 0 1px 2px rgba(0, 0, 0, 0.18), 0 1px 0 rgba(255, 255, 255, 0.04) inset;
  --temp-shadow-card-current: 0 2px 6px rgba(0, 0, 0, 0.28), 0 1px 0 rgba(255, 255, 255, 0.05) inset;
  --temp-shadow-btn: 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.1) inset;
  --temp-shadow-btn-hover: 0 2px 4px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(255, 255, 255, 0.12) inset;
  --temp-inset-highlight: 0 1px 0 rgba(255, 255, 255, 0.05) inset;
}

.temp-panel::-webkit-scrollbar {
  display: none;
}

.temp-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--temp-accent-border);
  border-radius: var(--temp-radius-md);
  background: var(--temp-accent-soft);
  box-shadow: var(--temp-shadow-md);
}

.temp-panel-title-group {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
  flex-wrap: wrap;
}

.temp-panel-tooltip-trigger {
  display: inline-flex;
}

.temp-panel-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--temp-accent-text);
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.temp-panel-version-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.1875rem 0.4375rem;
  border-radius: var(--temp-radius-sm);
  background: var(--app-surface);
  border: 1px solid var(--temp-accent-border);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  box-shadow: var(--temp-shadow-sm);
}

.temp-panel-version-current-label,
.temp-panel-version-latest-label {
  padding: 0.0625rem 0.3125rem;
  border-radius: var(--temp-radius-sm);
  font-size: 0.625rem;
  font-weight: 700;
}

.temp-panel-version-current-label {
  background: var(--temp-version-current-bg);
  color: var(--temp-version-current-text);
}

.temp-panel-version-latest-label {
  background: var(--temp-version-latest-bg);
  color: var(--temp-version-latest-text);
}

.temp-panel-version-current {
  color: var(--temp-version-current-text);
  font-weight: 700;
}

.temp-panel-version-sep {
  color: var(--temp-accent);
  font-weight: 700;
}

.temp-panel-version-latest {
  color: var(--temp-version-latest-text);
  font-weight: 700;
}

.temp-panel-update-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  height: 1.875rem;
  padding: 0 0.6875rem;
  border: 1px solid var(--temp-update-btn-border);
  border-radius: var(--temp-radius-md);
  background: var(--temp-update-btn-bg);
  color: var(--temp-update-btn-text);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  box-shadow: var(--temp-shadow-btn);
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease,
    transform 0.15s ease;
}

.temp-panel-update-btn:hover:not(:disabled) {
  background: var(--temp-update-btn-bg-hover);
  box-shadow: var(--temp-shadow-btn-hover);
  transform: translateY(-1px);
}

.temp-panel-update-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: var(--temp-shadow-btn);
}

.temp-panel-update-btn:disabled,
.temp-panel-update-btn--disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.temp-panel-update-btn--loading {
  cursor: wait;
}

.temp-panel-update-icon {
  flex-shrink: 0;
  font-size: 1rem;
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
  border: 1px solid var(--temp-card-border);
  border-radius: var(--temp-radius-md);
  background: var(--temp-card-bg);
  padding: 0.75rem 0.875rem;
  box-shadow: var(--temp-shadow-card);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.temp-panel-card--current {
  border-color: var(--temp-card-current-border);
  background: var(--temp-card-current-bg);
  box-shadow: var(--temp-shadow-card-current);
  border-left: 3px solid var(--temp-accent);
}

.temp-panel-tip {
  margin-bottom: 0.75rem;
  padding: 0.4375rem 0.5625rem;
  border-radius: var(--temp-radius-sm);
  border: 1px solid var(--temp-accent-border);
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  background: var(--temp-accent-soft);
  line-height: 1.45;
}

.temp-panel-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
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
  border-radius: 50%;
  color: var(--app-text-muted);
  font-size: 0.875rem;
  cursor: help;
  transition: color 0.15s ease;
}

.temp-panel-desc-trigger:hover,
.temp-panel-desc-trigger:focus-visible {
  color: var(--temp-accent);
  outline: none;
}

.temp-panel-current-tag {
  flex-shrink: 0;
  padding: 0.125rem 0.4375rem;
  border-radius: var(--temp-radius-sm);
  background-color: var(--temp-current-tag-bg);
  border: 1px solid var(--temp-current-tag-border);
  color: var(--temp-current-tag-text);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.2;
  box-shadow: var(--temp-shadow-sm);
}

.temp-panel-latest-tag {
  flex-shrink: 0;
  padding: 0.125rem 0.4375rem;
  border-radius: var(--temp-radius-sm);
  background-color: var(--temp-latest-tag-bg);
  border: 1px solid var(--temp-latest-tag-border);
  color: var(--temp-latest-tag-text);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.2;
  box-shadow: var(--temp-shadow-sm);
}

.temp-panel-card-time {
  padding: 0.125rem 0.375rem;
  border-radius: var(--temp-radius-sm);
  font-size: 0.75rem;
  color: var(--temp-accent-text);
  background: var(--temp-accent-soft);
  border: 1px solid var(--temp-accent-border);
  line-height: 1.35;
}

.temp-panel-card-update-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3125rem;
  height: 1.625rem;
  padding: 0 0.5625rem;
  border: 1px solid var(--temp-update-btn-border);
  border-radius: var(--temp-radius-sm);
  background: var(--temp-update-btn-bg);
  color: var(--temp-update-btn-text);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  box-shadow: var(--temp-shadow-btn);
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease,
    transform 0.15s ease;
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
  background: var(--temp-update-btn-bg-hover);
  box-shadow: var(--temp-shadow-btn-hover);
  transform: translateY(-1px);
}

.temp-panel-card-update-btn:disabled,
.temp-panel-card-update-btn--disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.temp-panel-files-section {
  border: 1px solid var(--temp-accent-border);
  border-radius: var(--temp-radius-md);
  overflow: hidden;
  box-shadow: var(--temp-shadow-sm);
}

.temp-panel-files-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: none;
  background: var(--temp-files-toggle-bg);
  color: var(--temp-files-toggle-text);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.temp-panel-files-toggle:hover {
  background: var(--temp-files-toggle-bg-hover);
}

.temp-panel-files-toggle-left {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.temp-panel-files-toggle-label {
  font-size: 0.8125rem;
  font-weight: 600;
}

.temp-panel-files-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3125rem;
  border-radius: var(--temp-radius-sm);
  background: var(--temp-files-count-bg);
  color: var(--temp-files-count-text);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.2) inset;
}

.temp-panel-files-arrow {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  color: var(--temp-accent);
  transition: transform 0.2s ease;
}

.temp-panel-files-arrow--expanded {
  transform: rotate(180deg);
}

.temp-panel-file-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0 0.5rem 0.5rem;
  max-height: 16rem;
  overflow-y: auto;
  background: var(--temp-accent-soft);
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
  background: var(--temp-file-item-bg);
  border: 1px solid var(--temp-file-item-border);
  box-shadow: var(--temp-shadow-sm);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.temp-panel-file-item:hover {
  border-color: var(--temp-accent-border);
  box-shadow: var(--temp-shadow-md);
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
  padding: 0.0625rem 0.375rem;
  border-radius: var(--temp-radius-sm);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1.3;
  border: 1px solid transparent;
}

.temp-panel-file-action--add {
  background: var(--temp-action-add-bg);
  color: var(--temp-action-add-text);
  border-color: var(--temp-current-tag-border);
}

.temp-panel-file-action--update {
  background: var(--temp-action-update-bg);
  color: var(--temp-action-update-text);
  border-color: var(--temp-accent-border);
}

.temp-panel-file-action--delete {
  background: var(--temp-action-delete-bg);
  color: var(--temp-action-delete-text);
  border-color: color-mix(in srgb, var(--temp-action-delete-text) 35%, transparent);
}

.temp-panel-file-desc {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--app-text-muted);
  line-height: 1.4;
}

.temp-panel-file-empty {
  padding: 0.4375rem 0.5625rem;
  border-radius: var(--temp-radius-sm);
  border: 1px solid var(--temp-accent-border);
  font-size: 0.8125rem;
  color: var(--app-text-muted);
  background: var(--temp-accent-soft);
  box-shadow: var(--temp-shadow-sm);
}
</style>
