<script setup lang="ts">
import { ArrowLeft, Collection, Connection, DataAnalysis, Download, Folder, Link, Odometer, Picture, Refresh, Search, User, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import UserMenu from '@/components/UserMenu.vue'
import AdminChart from './AdminChart.vue'
import { createBarOption, createDonutOption, createLineOption } from './chartOptions'
import {
  getAdminAssets,
  getAdminDashboardOverview,
  getAdminProject,
  getAdminProjects,
  getAdminUser,
  getAdminUsers,
  syncAdminStorage,
  updateAdminUser,
  type AdminAsset,
  type AdminConversation,
  type AdminDashboardOverview,
  type AdminProject,
  type AdminProjectDetail,
  type AdminUser,
  type UpdateAdminUserInput,
} from '@/http/admin'
import { getUserInfo, type UserInfoResponse, type UserRole } from '@/http/user'

defineOptions({ name: 'AdminConsole' })

type AdminView = 'overview' | 'users' | 'projects' | 'assets'
type ProjectStatusFilter = 'all' | 'active' | 'deleted'

const ROLE_LABEL: Record<UserRole, string> = {
  super: '超级管理员',
  admin: '管理员',
  normal: '普通用户',
  disabled: '已禁用',
}

const PROJECT_TYPE_LABEL: Record<AdminProject['type'], string> = {
  tool: '工具',
  '2d': '2D 游戏',
  '3d': '3D 游戏',
}

const PAGE_SIZE = 20
const STORAGE_SYNC_POLL_INTERVAL = 1500
const router = useRouter()
const activeView = ref<AdminView>('overview')
const loading = ref(false)
const overviewLoading = ref(false)
const storageSyncing = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const assetsLoading = ref(false)
const users = ref<AdminUser[]>([])
const projects = ref<AdminProject[]>([])
const assets = ref<AdminAsset[]>([])
const detailProjects = ref<AdminProject[]>([])
const detailProjectTotal = ref(0)
const currentUser = ref<UserInfoResponse | null>(null)
const overview = ref<AdminDashboardOverview | null>(null)
const overviewDays = ref<7 | 30>(30)
const userQuery = ref('')
const userRoleFilter = ref<UserRole | 'all'>('all')
const projectQuery = ref('')
const projectTypeFilter = ref<AdminProject['type'] | 'all'>('all')
const projectStatusFilter = ref<ProjectStatusFilter>('all')
const assetQuery = ref('')
const userPage = ref(1)
const projectPage = ref(1)
const assetPage = ref(1)
const userTotal = ref(0)
const projectTotal = ref(0)
const assetHasMore = ref(false)
const assetNextMarker = ref<string | null>(null)
const assetMarkers = ref<Array<string | null>>([null])
const failedAssetPreviews = ref(new Set<string>())
const projectUserFilter = ref<{ id: number; label: string } | null>(null)
const assetUserFilter = ref<{ id: number; label: string } | null>(null)
const detailVisible = ref(false)
const projectDetailVisible = ref(false)
const projectDetailLoading = ref(false)
const selectedUser = ref<AdminUser | null>(null)
const selectedProject = ref<AdminProject | null>(null)
const projectDetail = ref<AdminProjectDetail | null>(null)
const projectConversationPage = ref(1)
const editForm = reactive({ role: 'normal' as UserRole, qqOpenid: '', wxOpenid: '' })
const originalEdit = reactive({ role: 'normal' as UserRole, qqOpenid: '', wxOpenid: '' })
let storageSyncPollTimer: number | null = null
let manualStorageSyncPending = false

const VIEW_META: Record<AdminView, { kicker: string; title: string; description: string }> = {
  overview: { kicker: '运营', title: '运营总览', description: '查看全站用户、项目、AI 用量与 COS 存储状态。' },
  users: { kicker: '用户', title: '用户与权限', description: '查看账户状态、第三方绑定和项目使用情况。' },
  projects: { kicker: '项目', title: '全量项目', description: '查看所有用户的项目、运行状态与模型用量。' },
  assets: { kicker: '素材', title: '上传素材', description: '查看各用户上传到 COS 的图片、文件与目录归属。' },
}

const activeViewMeta = computed(() => VIEW_META[activeView.value])

const summary = computed(() => ({
  users: userTotal.value,
  projects: projectTotal.value,
  activeProjects: projects.value.filter((item) => item.isDeleted === 0).length,
  tokens: projects.value.reduce((total, item) => total + toNumber(item.aiTotalTokens), 0),
}))

const projectTypeStats = computed(() => {
  const counts: Record<AdminProject['type'], number> = { tool: 0, '2d': 0, '3d': 0 }
  projects.value.forEach((project) => {
    counts[project.type] += 1
  })
  const total = Math.max(projects.value.length, 1)
  return (Object.keys(counts) as AdminProject['type'][]).map((type) => ({
    type,
    label: PROJECT_TYPE_LABEL[type],
    count: counts[type],
    percent: Math.round((counts[type] / total) * 100),
  }))
})

const projectStatusStats = computed(() => {
  const active = projects.value.filter((project) => project.isDeleted === 0).length
  const archived = projects.value.length - active
  return {
    active,
    archived,
    total: projects.value.length,
    activePercent: projects.value.length ? Math.round((active / projects.value.length) * 100) : 0,
  }
})

const tokenStats = computed(() => {
  const prompt = projects.value.reduce((total, project) => total + toNumber(project.aiPromptTokens), 0)
  const completion = projects.value.reduce((total, project) => total + toNumber(project.aiCompletionTokens), 0)
  const total = prompt + completion
  return {
    prompt,
    completion,
    promptPercent: total ? Math.round((prompt / total) * 100) : 0,
    completionPercent: total ? Math.round((completion / total) * 100) : 0,
  }
})

const userRoleStats = computed(() => {
  const counts: Record<UserRole, number> = { super: 0, admin: 0, normal: 0, disabled: 0 }
  users.value.forEach((user) => {
    counts[user.role] += 1
  })
  const total = Math.max(users.value.length, 1)
  return (Object.keys(counts) as UserRole[]).map((role) => ({
    role,
    label: ROLE_LABEL[role],
    count: counts[role],
    percent: Math.round((counts[role] / total) * 100),
  }))
})

const userBindingStats = computed(() => {
  const total = users.value.length
  const qq = users.value.filter((user) => Boolean(user.qqOpenid)).length
  const wechat = users.value.filter((user) => Boolean(user.wxOpenid)).length
  const both = users.value.filter((user) => Boolean(user.qqOpenid && user.wxOpenid)).length
  return {
    total,
    qq,
    wechat,
    both,
    qqPercent: total ? Math.round((qq / total) * 100) : 0,
    wechatPercent: total ? Math.round((wechat / total) * 100) : 0,
  }
})

const userProjectStats = computed(() => {
  const active = users.value.reduce((total, user) => total + toNumber(user.activeProjectCount), 0)
  const deleted = users.value.reduce((total, user) => total + toNumber(user.deletedProjectCount), 0)
  const total = active + deleted
  return {
    active,
    deleted,
    total,
    activePercent: total ? Math.round((active / total) * 100) : 0,
  }
})

const assetKindStats = computed(() => {
  const counts = new Map<string, number>()
  assets.value.forEach((asset) => {
    const label = asset.isDirectory ? 'DIR' : asset.extension.replace('.', '').toUpperCase() || 'FILE'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })
  const total = Math.max(assets.value.length, 1)
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([label, count], index) => ({ label, count, index, percent: Math.round((count / total) * 100) }))
})

const assetStorageStats = computed(() => {
  const totalBytes = assets.value.reduce((total, asset) => total + toNumber(asset.size), 0)
  const imageBytes = assets.value.filter(isImageAsset).reduce((total, asset) => total + toNumber(asset.size), 0)
  const imageCount = assets.value.filter(isImageAsset).length
  return {
    totalBytes,
    imageBytes,
    otherBytes: Math.max(totalBytes - imageBytes, 0),
    imageCount,
    directoryCount: assets.value.filter((asset) => asset.isDirectory).length,
    imagePercent: totalBytes ? Math.round((imageBytes / totalBytes) * 100) : 0,
  }
})

const assetUploadTrend = computed(() => {
  const datedAssets = assets.value
    .map((asset) => ({ asset, date: asset.lastModified ? new Date(asset.lastModified) : null }))
    .filter((item): item is { asset: AdminAsset; date: Date } => Boolean(item.date && !Number.isNaN(item.date.getTime())))

  if (!datedAssets.length) return { days: [], points: '', areaPoints: '', max: 0 }

  const endDate = new Date(Math.max(...datedAssets.map((item) => item.date.getTime())))
  endDate.setHours(0, 0, 0, 0)
  const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(endDate)
    date.setDate(endDate.getDate() - (6 - index))
    const count = datedAssets.filter((item) => dateKey(item.date) === dateKey(date)).length
    return { label: `${date.getMonth() + 1}/${date.getDate()}`, count }
  })
  const max = Math.max(...days.map((day) => day.count), 1)
  const points = days.map((day, index) => `${(index / 6) * 280},${70 - (day.count / max) * 58}`).join(' ')
  return { days, points, areaPoints: `0,78 ${points} 280,78`, max }
})

const overviewGrowthChartOption = computed(() => {
  const rows = overview.value?.trends ?? []
  return createLineOption(
    rows.map((row) => row.date.slice(5).replace('-', '/')),
    [
      { name: '新增用户', values: rows.map((row) => toNumber(row.newUsers)), color: '#315efb' },
      { name: '新增项目', values: rows.map((row) => toNumber(row.newProjects)), color: '#ff5f56' },
    ],
  )
})

const overviewTokenChartOption = computed(() => {
  const rows = overview.value?.trends ?? []
  return createLineOption(
    rows.map((row) => row.date.slice(5).replace('-', '/')),
    [{ name: 'Token', values: rows.map((row) => toNumber(row.totalTokens)), color: '#8b5cf6' }],
  )
})

const userRoleChartOption = computed(() =>
  createBarOption(
    userRoleStats.value.map((item) => ({
      name: item.label,
      value: item.count,
      color: { super: '#315efb', admin: '#8b5cf6', normal: '#15946c', disabled: '#ff5f56' }[item.role],
    })),
  ),
)

const userBindingChartOption = computed(() =>
  createBarOption([
    { name: 'QQ', value: userBindingStats.value.qq, color: '#315efb' },
    { name: '微信', value: userBindingStats.value.wechat, color: '#15946c' },
    { name: '双端绑定', value: userBindingStats.value.both, color: '#8b5cf6' },
  ]),
)

const userProjectChartOption = computed(() =>
  createDonutOption(
    [
      { name: '运行中', value: userProjectStats.value.active, color: '#15946c' },
      { name: '已归档', value: userProjectStats.value.deleted, color: '#ff5f56' },
    ],
    `${userProjectStats.value.activePercent}%\n运行中`,
  ),
)

const projectTypeChartOption = computed(() =>
  createBarOption(
    projectTypeStats.value.map((item) => ({
      name: item.label,
      value: item.count,
      color: { tool: '#315efb', '2d': '#15946c', '3d': '#ff5f56' }[item.type],
    })),
  ),
)

const projectStatusChartOption = computed(() =>
  createDonutOption(
    [
      { name: '运行中', value: projectStatusStats.value.active, color: '#15946c' },
      { name: '已归档', value: projectStatusStats.value.archived, color: '#ff5f56' },
    ],
    `${projectStatusStats.value.activePercent}%\n运行中`,
  ),
)

const projectTokenChartOption = computed(() =>
  createDonutOption(
    [
      { name: '提示词', value: tokenStats.value.prompt, color: '#315efb' },
      { name: '生成量', value: tokenStats.value.completion, color: '#ff5f56' },
    ],
    `${tokenStats.value.promptPercent}%\n提示词`,
    formatNumber,
  ),
)

const assetKindChartOption = computed(() =>
  createBarOption(assetKindStats.value.map((item, index) => ({ name: item.label, value: item.count, color: ['#315efb', '#15946c', '#ff5f56', '#8b5cf6'][index] }))),
)

const assetStorageChartOption = computed(() =>
  createDonutOption(
    [
      { name: '图片', value: assetStorageStats.value.imageBytes, color: '#315efb' },
      { name: '其他', value: assetStorageStats.value.otherBytes, color: '#ff5f56' },
    ],
    `${assetStorageStats.value.imagePercent}%\n图片`,
    formatBytes,
  ),
)

const assetTrendChartOption = computed(() =>
  createLineOption(
    assetUploadTrend.value.days.map((day) => day.label),
    [{ name: '上传素材', values: assetUploadTrend.value.days.map((day) => day.count), color: '#0ea5e9' }],
  ),
)

const viewMetrics = computed(() => {
  if (activeView.value === 'overview') {
    const data = overview.value?.summary
    return [
      { label: '注册用户', value: formatNumber(toNumber(data?.users.total)), hint: `期间新增 ${formatNumber(toNumber(data?.users.newCount))}` },
      { label: '活跃用户', value: formatNumber(toNumber(data?.users.activeCount)), hint: `近 ${overviewDays.value} 天发生核心操作` },
      { label: '运行项目', value: formatNumber(toNumber(data?.projects.activeCount)), hint: `全部 ${formatNumber(toNumber(data?.projects.total))} 个项目` },
      { label: '期间 Token', value: formatNumber(toNumber(data?.ai.periodTotalTokens)), hint: `累计 ${formatNumber(toNumber(data?.ai.cumulativeTotalTokens))}` },
    ]
  }

  if (activeView.value === 'users') {
    return [
      { label: '注册用户', value: formatNumber(userTotal.value), hint: '数据库总数' },
      { label: '本页管理账号', value: formatNumber(users.value.filter((user) => ['super', 'admin'].includes(user.role)).length), hint: '超级管理员 / 管理员' },
      { label: '本页已绑定', value: formatNumber(users.value.filter((user) => user.qqOpenid || user.wxOpenid).length), hint: 'QQ 或微信' },
      { label: '本页项目', value: formatNumber(users.value.reduce((total, user) => total + toNumber(user.projectCount), 0)), hint: '包含已归档' },
    ]
  }

  if (activeView.value === 'assets') {
    return [
      { label: '本页素材', value: formatNumber(assets.value.length), hint: `第 ${assetPage.value} 页` },
      { label: '图片文件', value: formatNumber(assetStorageStats.value.imageCount), hint: '可直接预览' },
      { label: '本页占用', value: formatBytes(assetStorageStats.value.totalBytes), hint: '当前分页容量' },
      { label: '未匹配用户', value: formatNumber(assets.value.filter((asset) => !asset.userId).length), hint: '历史目录对象' },
    ]
  }

  return [
    { label: '全部项目', value: formatNumber(summary.value.projects), hint: '包含已归档' },
    { label: '本页运行项目', value: formatNumber(summary.value.activeProjects), hint: '当前分页' },
    { label: '本页提示词', value: formatNumber(tokenStats.value.prompt), hint: 'Prompt Token' },
    { label: '本页 Token', value: formatNumber(summary.value.tokens), hint: '当前分页' },
  ]
})

const filteredUsers = computed(() => {
  const keyword = userQuery.value.trim().toLowerCase()
  return users.value.filter((item) => {
    const matchesRole = userRoleFilter.value === 'all' || item.role === userRoleFilter.value
    const matchesKeyword = !keyword || [item.nickname, item.account, String(item.id), item.storageKey].some((value) => value?.toLowerCase().includes(keyword))
    return matchesRole && matchesKeyword
  })
})

const filteredProjects = computed(() => {
  const keyword = projectQuery.value.trim().toLowerCase()
  return projects.value.filter((item) => {
    const matchesType = projectTypeFilter.value === 'all' || item.type === projectTypeFilter.value
    const matchesStatus = projectStatusFilter.value === 'all' || (projectStatusFilter.value === 'active' ? item.isDeleted === 0 : item.isDeleted === 1)
    const matchesKeyword = !keyword || [item.title, item.desc, item.account, item.userNickname, String(item.id)].some((value) => value?.toLowerCase().includes(keyword))
    return matchesType && matchesStatus && matchesKeyword
  })
})

const filteredAssets = computed(() => {
  const keyword = assetQuery.value.trim().toLowerCase()
  return assets.value.filter((item) => !keyword || [item.fileName, item.relativePath, item.account, item.userNickname].some((value) => value?.toLowerCase().includes(keyword)))
})

const canManageSelectedUser = computed(() => {
  if (!currentUser.value || !selectedUser.value || currentUser.value.id === selectedUser.value.id) return false
  if (currentUser.value.role === 'super') return true
  return currentUser.value.role === 'admin' && ['normal', 'disabled'].includes(selectedUser.value.role)
})

const availableRoles = computed<UserRole[]>(() => (currentUser.value?.role === 'super' ? ['super', 'admin', 'normal', 'disabled'] : ['normal', 'disabled']))

const hasEditChanges = computed(
  () => editForm.role !== originalEdit.role || editForm.qqOpenid.trim() !== originalEdit.qqOpenid || editForm.wxOpenid.trim() !== originalEdit.wxOpenid,
)

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: value >= 1000000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

function toNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatBytes(value: number): string {
  const size = toNumber(value)
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function conversationContextPercent(conversation: AdminConversation): number {
  if (!conversation.contextLimit) return 0
  return Math.min(Math.round((conversation.currentContextTokens / conversation.contextLimit) * 100), 100)
}

function isImageAsset(asset: AdminAsset): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp'].includes(asset.extension.toLowerCase())
}

function handleAssetImageError(key: string) {
  failedAssetPreviews.value = new Set(failedAssetPreviews.value).add(key)
}

function copyUserToEditor(user: AdminUser) {
  editForm.role = user.role
  editForm.qqOpenid = user.qqOpenid ?? ''
  editForm.wxOpenid = user.wxOpenid ?? ''
  originalEdit.role = editForm.role
  originalEdit.qqOpenid = editForm.qqOpenid
  originalEdit.wxOpenid = editForm.wxOpenid
}

async function loadUsers(page = userPage.value) {
  const result = await getAdminUsers({ page, pageSize: PAGE_SIZE })
  users.value = result.list
  userPage.value = result.pagination.page
  userTotal.value = result.pagination.total ?? result.list.length
}

async function loadProjects(page = projectPage.value, userId = projectUserFilter.value?.id) {
  const result = await getAdminProjects({ page, pageSize: PAGE_SIZE, userId })
  projects.value = result.list
  projectPage.value = result.pagination.page
  projectTotal.value = result.pagination.total ?? result.list.length
}

async function loadAssets(page = assetPage.value) {
  if (assetsLoading.value) return
  assetsLoading.value = true
  try {
    const marker = page > 1 ? (assetMarkers.value[page - 1] ?? undefined) : undefined
    const result = await getAdminAssets({ page, pageSize: PAGE_SIZE, marker, userId: assetUserFilter.value?.id })
    assets.value = result.list
    assetPage.value = result.pagination.page
    assetHasMore.value = result.pagination.hasMore ?? false
    assetNextMarker.value = result.pagination.nextMarker ?? null
    assetMarkers.value[page] = assetNextMarker.value
  } finally {
    assetsLoading.value = false
  }
}

function stopStorageSyncPolling() {
  if (storageSyncPollTimer === null) return
  window.clearTimeout(storageSyncPollTimer)
  storageSyncPollTimer = null
}

function finishStorageSyncPolling() {
  stopStorageSyncPolling()
  storageSyncing.value = false
  if (!manualStorageSyncPending) return

  manualStorageSyncPending = false
  const error = overview.value?.summary.storage.errorMessage
  if (error || overview.value?.summary.storage.syncStatus === 'error') {
    ElMessage.error(error || 'COS 存储同步失败')
  } else {
    ElMessage.success('COS 存储同步完成')
  }
}

function scheduleStorageSyncPolling() {
  if (storageSyncPollTimer !== null || !overview.value?.storageSync.running) return
  storageSyncPollTimer = window.setTimeout(async () => {
    storageSyncPollTimer = null
    let failed = false
    try {
      await loadOverview()
    } catch {
      failed = true
      manualStorageSyncPending = false
      storageSyncing.value = false
      if (overview.value) overview.value.storageSync.running = false
    } finally {
      if (!failed && overview.value?.storageSync.running) scheduleStorageSyncPolling()
    }
  }, STORAGE_SYNC_POLL_INTERVAL)
}

function reconcileStorageSyncState() {
  if (overview.value?.storageSync.running) {
    scheduleStorageSyncPolling()
    return
  }
  finishStorageSyncPolling()
}

async function loadOverview(days = overviewDays.value) {
  if (overviewLoading.value) return
  overviewLoading.value = true
  try {
    overview.value = await getAdminDashboardOverview(days)
    overviewDays.value = overview.value.range.days
    reconcileStorageSyncState()
  } finally {
    overviewLoading.value = false
  }
}

async function loadDashboard() {
  if (loading.value) return
  loading.value = true
  try {
    const [profile] = await Promise.all([getUserInfo(), loadOverview(30), loadUsers(1), loadProjects(1)])
    currentUser.value = profile
  } finally {
    loading.value = false
  }
}

async function selectView(view: AdminView) {
  activeView.value = view
  if (view === 'overview' && !overview.value) await loadOverview()
  if (view === 'assets' && assets.value.length === 0) await loadAssets(1)
}

async function refreshCurrentView() {
  if (activeView.value === 'overview') await loadOverview()
  if (activeView.value === 'users') await loadUsers()
  if (activeView.value === 'projects') await loadProjects()
  if (activeView.value === 'assets') await loadAssets()
}

async function changeOverviewDays(days: 7 | 30) {
  if (days === overviewDays.value || overviewLoading.value) return
  overviewDays.value = days
  await loadOverview(days)
}

async function runStorageSync() {
  if (currentUser.value?.role !== 'super' || storageSyncing.value || overviewLoading.value) return
  storageSyncing.value = true
  manualStorageSyncPending = true
  try {
    const result = await syncAdminStorage()
    ElMessage.info(result.started ? 'COS 存储同步已启动' : 'COS 存储同步正在运行')
    await loadOverview()
  } catch (error) {
    manualStorageSyncPending = false
    storageSyncing.value = false
    throw error
  }
}

async function loadDetailProjects(userId: number) {
  const result = await getAdminProjects({ page: 1, pageSize: 5, userId })
  detailProjects.value = result.list
  detailProjectTotal.value = result.pagination.total ?? result.list.length
}

async function openUserDetail(user: AdminUser) {
  detailVisible.value = true
  detailLoading.value = true
  selectedUser.value = user
  detailProjects.value = []
  detailProjectTotal.value = 0
  copyUserToEditor(user)
  try {
    const [detail] = await Promise.all([getAdminUser(user.id), loadDetailProjects(user.id)])
    selectedUser.value = detail
    copyUserToEditor(detail)
  } finally {
    detailLoading.value = false
  }
}

async function openUserById(id: number) {
  const cached = users.value.find((user) => user.id === id)
  if (cached) {
    await openUserDetail(cached)
    return
  }

  detailVisible.value = true
  detailLoading.value = true
  selectedUser.value = null
  detailProjects.value = []
  detailProjectTotal.value = 0
  try {
    const [detail] = await Promise.all([getAdminUser(id), loadDetailProjects(id)])
    selectedUser.value = detail
    copyUserToEditor(detail)
  } finally {
    detailLoading.value = false
  }
}

async function openProjectDetail(project: AdminProject, page = 1) {
  if (selectedProject.value?.id !== project.id) projectDetail.value = null
  selectedProject.value = project
  projectDetailVisible.value = true
  projectDetailLoading.value = true
  projectConversationPage.value = page
  try {
    projectDetail.value = await getAdminProject(project.id, { page, pageSize: PAGE_SIZE })
    projectConversationPage.value = projectDetail.value.conversations.pagination.page
  } finally {
    projectDetailLoading.value = false
  }
}

async function openRankedProject(projectId: number) {
  projectDetailVisible.value = true
  projectDetailLoading.value = true
  projectConversationPage.value = 1
  try {
    projectDetail.value = await getAdminProject(projectId, { page: 1, pageSize: PAGE_SIZE })
    selectedProject.value = projectDetail.value
  } finally {
    projectDetailLoading.value = false
  }
}

function handleProjectRowClick(project: AdminProject) {
  void openProjectDetail(project)
}

async function loadProjectConversations(page: number) {
  if (!selectedProject.value) return
  await openProjectDetail(selectedProject.value, page)
}

async function openProjectFromUser(project: AdminProject) {
  detailVisible.value = false
  await openProjectDetail(project)
}

function mergeUpdatedUser(updated: AdminUser) {
  const index = users.value.findIndex((item) => item.id === updated.id)
  if (index >= 0) users.value[index] = { ...users.value[index], ...updated }
  selectedUser.value = updated
  copyUserToEditor(updated)
}

async function saveUser() {
  if (!selectedUser.value || !canManageSelectedUser.value || !hasEditChanges.value) return

  const payload: UpdateAdminUserInput = {}
  if (editForm.role !== originalEdit.role) payload.role = editForm.role
  if (editForm.qqOpenid.trim() !== originalEdit.qqOpenid) payload.qqOpenid = editForm.qqOpenid.trim() || null
  if (editForm.wxOpenid.trim() !== originalEdit.wxOpenid) payload.wxOpenid = editForm.wxOpenid.trim() || null

  if (payload.role === 'disabled') {
    await ElMessageBox.confirm(`禁用后，${selectedUser.value.nickname || selectedUser.value.account} 将立即无法登录。`, '确认禁用用户', {
      type: 'warning',
      confirmButtonText: '确认禁用',
      cancelButtonText: '取消',
    })
  }

  saving.value = true
  try {
    mergeUpdatedUser(await updateAdminUser(selectedUser.value.id, payload))
    ElMessage.success('用户资料已更新')
  } finally {
    saving.value = false
  }
}

async function viewUsersProjects(user: AdminUser) {
  projectUserFilter.value = { id: user.id, label: user.nickname || user.account }
  projectQuery.value = ''
  projectTypeFilter.value = 'all'
  projectStatusFilter.value = 'all'
  activeView.value = 'projects'
  detailVisible.value = false
  await loadProjects(1, user.id)
}

async function clearProjectUserFilter() {
  projectUserFilter.value = null
  await loadProjects(1)
}

async function viewUserAssets(user: AdminUser) {
  assetUserFilter.value = { id: user.id, label: user.nickname || user.account }
  assetMarkers.value = [null]
  assetQuery.value = ''
  activeView.value = 'assets'
  detailVisible.value = false
  await loadAssets(1)
}

async function clearAssetUserFilter() {
  assetUserFilter.value = null
  assetMarkers.value = [null]
  await loadAssets(1)
}

async function handleAssetPageChange(page: number) {
  if (page > assetPage.value && !assetHasMore.value) return
  await loadAssets(page)
}

onMounted(() => {
  void loadDashboard()
})

onBeforeUnmount(() => {
  stopStorageSyncPolling()
})
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <button class="admin-brand" type="button" aria-label="返回项目中心" @click="router.push('/')">
        <span class="admin-brand-mark"><span /></span>
        <span class="admin-brand-copy"><strong>AI Agent</strong><small>CONTROL DESK</small></span>
      </button>

      <nav class="admin-navigation" aria-label="管理控制台导航">
        <p>管理视图</p>
        <button :class="{ active: activeView === 'overview' }" type="button" @click="selectView('overview')">
          <el-icon><Odometer /></el-icon><span>运营总览</span><b>LIVE</b>
        </button>
        <button :class="{ active: activeView === 'users' }" type="button" @click="selectView('users')">
          <el-icon><User /></el-icon><span>用户管理</span><b>{{ userTotal }}</b>
        </button>
        <button :class="{ active: activeView === 'projects' }" type="button" @click="selectView('projects')">
          <el-icon><Folder /></el-icon><span>项目总览</span><b>{{ projectTotal }}</b>
        </button>
        <button :class="{ active: activeView === 'assets' }" type="button" @click="selectView('assets')">
          <el-icon><Picture /></el-icon><span>素材管理</span><b>{{ assets.length || '—' }}</b>
        </button>
      </nav>

      <div class="admin-sidebar-foot">
        <span class="admin-live-dot" />
        <span
          ><strong>服务已连接</strong><small>{{ currentUser?.role === 'super' ? '超级管理员权限' : '管理员权限' }}</small></span
        >
      </div>
    </aside>

    <main class="admin-main">
      <header class="admin-topbar">
        <button class="back-button" type="button" @click="router.push('/')">
          <el-icon><ArrowLeft /></el-icon><span>返回项目中心</span>
        </button>
        <div class="admin-topbar-actions">
          <el-tooltip content="刷新当前数据" placement="bottom">
            <button class="icon-button" type="button" :disabled="loading || overviewLoading || assetsLoading" aria-label="刷新当前数据" @click="refreshCurrentView">
              <el-icon :class="{ spinning: loading || overviewLoading || assetsLoading }"><Refresh /></el-icon>
            </button>
          </el-tooltip>
          <ThemeToggle />
          <UserMenu :nickname="currentUser?.nickname" :avatar="currentUser?.avatar" />
        </div>
      </header>

      <section class="admin-heading">
        <div>
          <p class="admin-kicker"><DataAnalysis /> 管理控制台 / {{ activeViewMeta.kicker }}</p>
          <h1>{{ activeViewMeta.title }}</h1>
          <p>{{ activeViewMeta.description }}</p>
        </div>
        <div class="admin-heading-actions">
          <div v-if="activeView === 'overview'" class="range-switch" aria-label="统计时间范围">
            <button type="button" :class="{ active: overviewDays === 7 }" @click="changeOverviewDays(7)">近 7 天</button>
            <button type="button" :class="{ active: overviewDays === 30 }" @click="changeOverviewDays(30)">近 30 天</button>
          </div>
          <span class="admin-access-badge" :class="currentUser ? ['role-chip', `role-chip--${currentUser.role}`] : 'admin-access-badge--pending'">{{
            currentUser ? ROLE_LABEL[currentUser.role] : '权限校验中'
          }}</span>
        </div>
      </section>

      <section class="admin-metrics" aria-label="平台统计">
        <article v-for="(metric, index) in viewMetrics" :key="metric.label" :class="{ 'admin-metric-accent': index === viewMetrics.length - 1 }">
          <span>{{ metric.label }}</span
          ><strong>{{ metric.value }}</strong
          ><small>{{ metric.hint }}</small>
        </article>
      </section>

      <section
        class="admin-insights"
        :aria-label="activeView === 'overview' ? '全站运营分析' : activeView === 'users' ? '当前用户分页分析' : activeView === 'projects' ? '当前项目分页分析' : '当前素材分页分析'"
      >
        <header class="insights-heading">
          <div>
            <span>{{ activeView === 'overview' ? '全站脉搏' : activeView === 'users' ? '账户分析' : activeView === 'projects' ? '运行分析' : '存储分析' }}</span
            ><strong>{{
              activeView === 'overview'
                ? `${overview?.range.startDate ?? '—'} 至 ${overview?.range.endDate ?? '—'}`
                : activeView === 'users'
                  ? '当前用户分页'
                  : activeView === 'projects'
                    ? '当前项目分页'
                    : '当前素材分页'
            }}</strong>
          </div>
          <small v-if="activeView === 'overview'">北京时间 · 更新于 {{ formatDateTime(overview?.generatedAt) }}</small>
          <small v-else
            >PAGE {{ activeView === 'users' ? userPage : activeView === 'projects' ? projectPage : assetPage }} /
            {{ activeView === 'users' ? users.length : activeView === 'projects' ? projects.length : assets.length }} RECORDS</small
          >
        </header>

        <div v-if="activeView === 'overview'" v-loading="overviewLoading" class="insights-grid overview-insights-grid">
          <article class="overview-line-chart">
            <div class="insight-title"><span>增长轨迹</span><small>新增用户 / 项目</small></div>
            <AdminChart class="admin-chart admin-chart--overview" :option="overviewGrowthChartOption" label="用户和项目新增趋势，可悬浮查看每日数据并点击图例筛选" />
          </article>

          <article class="overview-line-chart">
            <div class="insight-title">
              <span>AI 消耗</span><small>{{ overview?.summary.ai.modelCalls ?? 0 }} 次调用</small>
            </div>
            <div class="token-chart-total">
              <strong>{{ formatNumber(overview?.summary.ai.periodTotalTokens ?? 0) }}</strong
              ><small>期间 Token</small>
            </div>
            <AdminChart class="admin-chart admin-chart--overview-token" :option="overviewTokenChartOption" label="AI Token 使用趋势，可悬浮查看每日用量" />
          </article>

          <article class="overview-storage-state">
            <div class="insight-title">
              <span>COS 存储</span
              ><small>{{ overview?.summary.storage.syncStatus === 'success' ? '同步正常' : overview?.summary.storage.syncStatus === 'error' ? '同步异常' : '等待首次同步' }}</small>
            </div>
            <div class="storage-primary">
              <strong>{{ formatBytes(overview?.summary.storage.totalBytes ?? 0) }}</strong
              ><small>{{ formatNumber(overview?.summary.storage.fileCount ?? 0) }} 个文件</small>
            </div>
            <dl class="storage-facts">
              <div>
                <dt>图片</dt>
                <dd>{{ formatNumber(overview?.summary.storage.imageCount ?? 0) }}</dd>
              </div>
              <div>
                <dt>视频</dt>
                <dd>{{ formatNumber(overview?.summary.storage.videoCount ?? 0) }}</dd>
              </div>
              <div>
                <dt>孤立文件</dt>
                <dd :class="{ warning: (overview?.summary.storage.orphanFileCount ?? 0) > 0 }">{{ formatNumber(overview?.summary.storage.orphanFileCount ?? 0) }}</dd>
              </div>
            </dl>
            <div class="storage-sync-row">
              <span>同步于 {{ formatDateTime(overview?.summary.storage.lastSyncedAt) }}</span>
              <button v-if="currentUser?.role === 'super'" type="button" :disabled="overviewLoading || storageSyncing || overview?.storageSync.running" @click="runStorageSync">
                <el-icon :class="{ spinning: storageSyncing || overview?.storageSync.running }"><Refresh /></el-icon>{{ overview?.storageSync.running ? '同步中' : '立即同步' }}
              </button>
            </div>
          </article>
        </div>

        <div v-else-if="activeView === 'users'" class="insights-grid">
          <article class="type-chart role-distribution-chart">
            <div class="insight-title"><span>权限分布</span><small>四种权限</small></div>
            <AdminChart class="admin-chart" :option="userRoleChartOption" label="当前分页用户权限分布，可悬浮查看数量" />
          </article>

          <article class="binding-chart">
            <div class="insight-title"><span>账号绑定</span><small>当前分页覆盖率</small></div>
            <AdminChart class="admin-chart" :option="userBindingChartOption" label="当前分页账号绑定情况，可悬浮查看数量" />
          </article>

          <article class="status-chart">
            <div class="insight-title"><span>用户项目</span><small>运行 / 归档</small></div>
            <AdminChart class="admin-chart admin-chart--donut" :option="userProjectChartOption" label="用户项目状态，可悬浮查看并点击图例筛选" />
          </article>
        </div>

        <div v-else-if="activeView === 'projects'" class="insights-grid">
          <article class="type-chart">
            <div class="insight-title"><span>项目构成</span><small>按类型</small></div>
            <AdminChart class="admin-chart" :option="projectTypeChartOption" label="当前分页项目类型分布，可悬浮查看数量" />
          </article>

          <article class="status-chart">
            <div class="insight-title"><span>项目状态</span><small>运行 / 归档</small></div>
            <AdminChart class="admin-chart admin-chart--donut" :option="projectStatusChartOption" label="当前分页项目状态，可悬浮查看并点击图例筛选" />
          </article>

          <article class="token-chart">
            <div class="insight-title"><span>Token 构成</span><small>本页用量</small></div>
            <AdminChart class="admin-chart admin-chart--donut" :option="projectTokenChartOption" label="当前分页 Token 构成，可悬浮查看并点击图例筛选" />
          </article>
        </div>

        <div v-else class="insights-grid">
          <article class="type-chart asset-kind-chart">
            <div class="insight-title"><span>文件格式</span><small>本页 TOP 4</small></div>
            <AdminChart v-if="assetKindStats.length" class="admin-chart" :option="assetKindChartOption" label="当前分页文件格式分布，可悬浮查看数量" />
            <div v-else class="insight-empty">进入素材页后加载统计</div>
          </article>

          <article class="asset-storage-chart">
            <div class="insight-title"><span>容量构成</span><small>图片 / 其他</small></div>
            <AdminChart class="admin-chart admin-chart--donut" :option="assetStorageChartOption" label="当前分页素材容量构成，可悬浮查看并点击图例筛选" />
          </article>

          <article class="asset-trend-chart">
            <div class="insight-title"><span>最近上传</span><small>截至本页最新日期</small></div>
            <AdminChart v-if="assetUploadTrend.days.length" class="admin-chart" :option="assetTrendChartOption" label="最近七日素材上传趋势，可悬浮查看每日数量" />
            <div v-else class="insight-empty">暂无上传时间数据</div>
          </article>
        </div>
      </section>

      <section v-if="activeView === 'overview'" class="overview-rankings" aria-label="全站排行榜">
        <header class="overview-section-heading">
          <div>
            <p>全站排行</p>
            <h2>资源使用 Top 10</h2>
          </div>
          <small>排名包含已删除项目的累计 Token</small>
        </header>
        <div class="ranking-grid">
          <article>
            <div class="ranking-title"><span>用户 Token</span><small>累计用量</small></div>
            <button v-for="(item, index) in overview?.rankings.usersByTokens" :key="item.userId" type="button" class="ranking-row" @click="openUserById(item.userId)">
              <b>{{ String(index + 1).padStart(2, '0') }}</b
              ><UserAvatar :avatar="item.avatar" /><span
                ><strong>{{ item.nickname || item.account }}</strong
                ><small>@{{ item.account }}</small></span
              ><em>{{ formatNumber(item.totalTokens) }}</em>
            </button>
            <div v-if="!overview?.rankings.usersByTokens.length" class="ranking-empty">暂无 AI 用量</div>
          </article>
          <article>
            <div class="ranking-title"><span>项目 Token</span><small>累计用量</small></div>
            <button v-for="(item, index) in overview?.rankings.projectsByTokens" :key="item.projectId" type="button" class="ranking-row" @click="openRankedProject(item.projectId)">
              <b>{{ String(index + 1).padStart(2, '0') }}</b
              ><span class="ranking-project-mark">P</span
              ><span
                ><strong>{{ item.title }}</strong
                ><small>{{ item.userNickname || item.account }}</small></span
              ><em>{{ formatNumber(item.totalTokens) }}</em>
            </button>
            <div v-if="!overview?.rankings.projectsByTokens.length" class="ranking-empty">暂无项目用量</div>
          </article>
          <article>
            <div class="ranking-title"><span>用户存储</span><small>当前容量</small></div>
            <button v-for="(item, index) in overview?.rankings.usersByStorage" :key="item.userId" type="button" class="ranking-row" @click="openUserById(item.userId)">
              <b>{{ String(index + 1).padStart(2, '0') }}</b
              ><UserAvatar :avatar="item.avatar" /><span
                ><strong>{{ item.nickname || item.account }}</strong
                ><small>{{ formatNumber(item.fileCount) }} 个文件</small></span
              ><em>{{ formatBytes(item.totalBytes) }}</em>
            </button>
            <div v-if="!overview?.rankings.usersByStorage.length" class="ranking-empty">等待 COS 首次同步</div>
          </article>
        </div>
      </section>

      <section v-if="activeView === 'users'" class="admin-dataset" aria-labelledby="users-title">
        <div class="dataset-header">
          <div>
            <p>账户目录</p>
            <h2 id="users-title">全部用户</h2>
          </div>
          <strong>{{ userTotal }} <small>个账户</small></strong>
        </div>
        <div class="dataset-toolbar">
          <el-input v-model="userQuery" clearable placeholder="筛选本页昵称、账号、ID 或存储键" :prefix-icon="Search" aria-label="筛选本页用户" />
          <el-select v-model="userRoleFilter" aria-label="按权限筛选">
            <el-option label="全部权限" value="all" />
            <el-option v-for="(label, value) in ROLE_LABEL" :key="value" :label="label" :value="value" />
          </el-select>
        </div>

        <div class="admin-table-wrap">
          <el-table v-loading="loading" :data="filteredUsers" row-key="id" class="admin-table" @row-click="openUserDetail">
            <el-table-column label="用户" min-width="250">
              <template #default="{ row }"
                ><div class="user-cell">
                  <UserAvatar :avatar="row.avatar" /><span
                    ><strong>{{ row.nickname || row.account }}</strong
                    ><small>@{{ row.account }} · ID {{ row.id }}</small></span
                  >
                </div></template
              >
            </el-table-column>
            <el-table-column label="权限" width="128"
              ><template #default="{ row }"
                ><span class="role-chip" :class="`role-chip--${row.role}`">{{ ROLE_LABEL[row.role as UserRole] }}</span></template
              ></el-table-column
            >
            <el-table-column label="账号绑定" width="150"
              ><template #default="{ row }"
                ><div class="binding-cell"><span :class="{ on: row.qqOpenid }">QQ</span><span :class="{ on: row.wxOpenid }">微信</span></div></template
              ></el-table-column
            >
            <el-table-column label="项目" width="140"
              ><template #default="{ row }"
                ><strong class="project-count">{{ row.activeProjectCount ?? 0 }}</strong
                ><span class="muted-text"> / {{ row.projectCount ?? 0 }}</span></template
              ></el-table-column
            >
            <el-table-column label="注册日期" width="130"
              ><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column
            >
            <el-table-column label="" width="58" align="right"
              ><template #default="{ row }"
                ><el-tooltip content="查看详情" placement="left"
                  ><button class="row-action" type="button" aria-label="查看用户详情" @click.stop="openUserDetail(row)">
                    <el-icon><View /></el-icon></button></el-tooltip></template
            ></el-table-column>
            <template #empty><div class="table-empty">本页没有匹配的用户</div></template>
          </el-table>
        </div>
        <el-pagination
          v-if="userTotal > PAGE_SIZE"
          v-model:current-page="userPage"
          :page-size="PAGE_SIZE"
          layout="prev, pager, next"
          :total="userTotal"
          @current-change="loadUsers"
        />
      </section>

      <section v-else-if="activeView === 'projects'" class="admin-dataset" aria-labelledby="projects-title">
        <div class="dataset-header">
          <div>
            <p>项目目录</p>
            <h2 id="projects-title">{{ projectUserFilter ? `${projectUserFilter.label} 的项目` : '全部项目' }}</h2>
          </div>
          <strong>{{ projectTotal }} <small>个项目</small></strong>
        </div>
        <div v-if="projectUserFilter" class="active-scope">仅查看用户：{{ projectUserFilter.label }}<button type="button" @click="clearProjectUserFilter">清除</button></div>
        <div class="dataset-toolbar dataset-toolbar--projects">
          <el-input v-model="projectQuery" clearable placeholder="筛选本页项目、所有者或 ID" :prefix-icon="Search" aria-label="筛选本页项目" />
          <el-select v-model="projectTypeFilter" aria-label="按项目类型筛选"
            ><el-option label="全部类型" value="all" /><el-option v-for="(label, value) in PROJECT_TYPE_LABEL" :key="value" :label="label" :value="value"
          /></el-select>
          <el-select v-model="projectStatusFilter" aria-label="按项目状态筛选"
            ><el-option label="全部状态" value="all" /><el-option label="运行中" value="active" /><el-option label="已归档" value="deleted"
          /></el-select>
        </div>

        <div class="admin-table-wrap">
          <el-table v-loading="loading" :data="filteredProjects" row-key="id" class="admin-table clickable-table" @row-click="handleProjectRowClick">
            <el-table-column label="项目" min-width="260"
              ><template #default="{ row }"
                ><div class="project-cell">
                  <span class="project-type-mark" :class="`project-type-mark--${row.type}`">{{ row.type }}</span
                  ><span
                    ><strong>{{ row.title || '未命名项目' }}</strong
                    ><small>ID {{ row.id }} · {{ row.desc || '暂无描述' }}</small></span
                  >
                </div></template
              ></el-table-column
            >
            <el-table-column label="所有者" min-width="160"
              ><template #default="{ row }"
                ><div class="project-owner-cell">
                  <UserAvatar :avatar="row.userAvatar" />
                  <span
                    ><button class="owner-link" type="button" @click.stop="row.userId && openUserById(row.userId)">{{ row.userNickname || row.account }}</button
                    ><small class="owner-account">@{{ row.account }}</small></span
                  >
                </div></template
              ></el-table-column
            >
            <el-table-column label="类型" width="105"
              ><template #default="{ row }">{{ PROJECT_TYPE_LABEL[row.type as AdminProject['type']] }}</template></el-table-column
            >
            <el-table-column label="Token" width="118" align="right"
              ><template #default="{ row }"
                ><span class="mono-text">{{ formatNumber(row.aiTotalTokens || 0) }}</span></template
              ></el-table-column
            >
            <el-table-column label="最近更新" width="130"
              ><template #default="{ row }">{{ formatDate(row.updateTime) }}</template></el-table-column
            >
            <el-table-column label="状态" width="100"
              ><template #default="{ row }"
                ><span class="project-status" :class="{ archived: row.isDeleted }"><i />{{ row.isDeleted ? '已归档' : '运行中' }}</span></template
              ></el-table-column
            >
            <el-table-column label="" width="92" align="right"
              ><template #default="{ row }"
                ><div class="row-action-group">
                  <el-tooltip content="查看项目详情" placement="left"
                    ><button class="row-action" type="button" aria-label="查看项目详情" @click.stop="openProjectDetail(row)">
                      <el-icon><View /></el-icon></button
                  ></el-tooltip>
                  <el-tooltip v-if="row.link" content="打开项目" placement="left"
                    ><a class="row-action" :href="row.link" target="_blank" rel="noopener" aria-label="打开项目" @click.stop
                      ><el-icon><Link /></el-icon></a
                  ></el-tooltip></div></template
            ></el-table-column>
            <template #empty><div class="table-empty">本页没有匹配的项目</div></template>
          </el-table>
        </div>
        <el-pagination
          v-if="projectTotal > PAGE_SIZE"
          v-model:current-page="projectPage"
          :page-size="PAGE_SIZE"
          layout="prev, pager, next"
          :total="projectTotal"
          @current-change="loadProjects"
        />
      </section>

      <section v-else-if="activeView === 'assets'" class="admin-dataset" aria-labelledby="assets-title">
        <div class="dataset-header">
          <div>
            <p>COS / UPLOADS</p>
            <h2 id="assets-title">{{ assetUserFilter ? `${assetUserFilter.label} 的素材` : '全部上传素材' }}</h2>
          </div>
          <strong>{{ assets.length }} <small>项 / 本页</small></strong>
        </div>
        <div v-if="assetUserFilter" class="active-scope">仅查看用户：{{ assetUserFilter.label }}<button type="button" @click="clearAssetUserFilter">清除</button></div>
        <div class="dataset-toolbar dataset-toolbar--assets">
          <el-input v-model="assetQuery" clearable placeholder="筛选本页文件名、路径或所有者" :prefix-icon="Search" aria-label="筛选本页素材" />
        </div>

        <div v-loading="assetsLoading" class="asset-grid">
          <article v-for="asset in filteredAssets" :key="asset.key" class="asset-card">
            <div class="asset-preview">
              <img
                v-if="asset.url && isImageAsset(asset) && !failedAssetPreviews.has(asset.key)"
                :src="asset.url"
                :alt="asset.fileName"
                crossorigin="anonymous"
                loading="lazy"
                referrerpolicy="no-referrer"
                @error="handleAssetImageError(asset.key)"
              />
              <span v-else
                ><Picture /><small>{{ asset.isDirectory ? 'DIR' : asset.extension || 'FILE' }}</small></span
              >
              <a v-if="asset.url" :href="asset.url" target="_blank" rel="noopener" aria-label="打开素材"
                ><el-icon><Download /></el-icon
              ></a>
            </div>
            <div class="asset-info">
              <strong :title="asset.fileName">{{ asset.fileName || asset.relativePath }}</strong>
              <p :title="asset.relativePath">{{ asset.relativePath }}</p>
              <footer>
                <span>{{ asset.userNickname || asset.account || '未匹配用户' }}</span
                ><span>{{ formatBytes(asset.size) }} · {{ formatDate(asset.lastModified) }}</span>
              </footer>
            </div>
          </article>
          <div v-if="!assetsLoading && filteredAssets.length === 0" class="asset-empty">本页没有匹配的素材</div>
        </div>
        <el-pagination
          v-if="assetPage > 1 || assetHasMore"
          v-model:current-page="assetPage"
          class="asset-pagination"
          :page-size="PAGE_SIZE"
          :page-count="assetPage + (assetHasMore ? 1 : 0)"
          :disabled="assetsLoading"
          layout="prev, pager, next"
          @current-change="handleAssetPageChange"
        />
      </section>
    </main>

    <el-drawer v-model="detailVisible" class="admin-user-drawer" size="min(34rem, 100%)" :show-close="true" destroy-on-close>
      <template #header
        ><div class="drawer-title">
          <span>用户详情</span><small v-if="selectedUser">ID {{ selectedUser.id }}</small>
        </div></template
      >
      <div v-loading="detailLoading" class="user-detail">
        <template v-if="selectedUser">
          <div class="user-detail-identity">
            <UserAvatar :avatar="selectedUser.avatar" />
            <div>
              <h2>{{ selectedUser.nickname || selectedUser.account }}</h2>
              <p>@{{ selectedUser.account }} · {{ formatDate(selectedUser.createdAt) }} 注册</p>
            </div>
            <span class="role-chip" :class="`role-chip--${selectedUser.role}`">{{ ROLE_LABEL[selectedUser.role] }}</span>
          </div>

          <section class="user-detail-section">
            <div class="detail-section-heading">
              <span><Connection />账户与权限</span><small v-if="!canManageSelectedUser">当前账户不可编辑</small>
            </div>
            <div class="storage-key-row">
              <span>存储目录键</span><code>{{ selectedUser.storageKey }}</code>
            </div>
            <el-form label-position="top" :disabled="!canManageSelectedUser">
              <el-form-item label="用户权限"
                ><el-select v-model="editForm.role"><el-option v-for="role in availableRoles" :key="role" :label="ROLE_LABEL[role]" :value="role" /></el-select
              ></el-form-item>
              <div class="binding-form-grid">
                <el-form-item label="QQ OpenID"><el-input v-model="editForm.qqOpenid" clearable placeholder="未绑定" /></el-form-item
                ><el-form-item label="微信 OpenID"><el-input v-model="editForm.wxOpenid" clearable placeholder="未绑定" /></el-form-item>
              </div>
            </el-form>
            <el-button v-if="canManageSelectedUser" type="primary" :disabled="!hasEditChanges" :loading="saving" @click="saveUser">保存更改</el-button>
          </section>

          <section class="user-detail-section">
            <div class="detail-section-heading">
              <span
                ><Collection />用户项目 <small>{{ detailProjectTotal }} 个</small></span
              ><button v-if="detailProjectTotal" type="button" @click="viewUsersProjects(selectedUser)">查看全部</button>
            </div>
            <div v-if="detailProjects.length" class="detail-project-list">
              <button v-for="project in detailProjects" :key="project.id" class="detail-project-item" type="button" @click="openProjectFromUser(project)">
                <span class="project-type-mark" :class="`project-type-mark--${project.type}`">{{ project.type }}</span>
                <div>
                  <strong>{{ project.title || '未命名项目' }}</strong
                  ><small>{{ formatDate(project.updateTime) }} 更新</small>
                </div>
                <span class="project-status" :class="{ archived: project.isDeleted }"><i />{{ project.isDeleted ? '已归档' : '运行中' }}</span>
              </button>
            </div>
            <div v-else class="detail-empty">该用户还没有项目</div>
          </section>

          <section class="user-detail-section user-assets-action">
            <div>
              <span><Picture />上传素材</span><small>按固定存储目录查看该用户的 COS 文件</small>
            </div>
            <el-button @click="viewUserAssets(selectedUser)">查看素材</el-button>
          </section>
        </template>
      </div>
    </el-drawer>

    <el-drawer v-model="projectDetailVisible" class="admin-project-drawer" size="min(46rem, 100%)" :show-close="true" destroy-on-close>
      <template #header
        ><div class="drawer-title">
          <span>项目详情</span><small v-if="selectedProject">ID {{ selectedProject.id }}</small>
        </div></template
      >
      <div v-loading="projectDetailLoading" class="project-detail">
        <template v-if="projectDetail">
          <header class="project-detail-identity">
            <span class="project-type-mark" :class="`project-type-mark--${projectDetail.type}`">{{ projectDetail.type }}</span>
            <div>
              <div class="project-detail-title-row">
                <h2>{{ projectDetail.title || '未命名项目' }}</h2>
                <span class="project-status" :class="{ archived: projectDetail.isDeleted }"><i />{{ projectDetail.isDeleted ? '已归档' : '运行中' }}</span>
              </div>
              <p>{{ projectDetail.desc || '暂无项目描述' }}</p>
            </div>
          </header>

          <section class="project-token-grid" aria-label="项目 Token 用量">
            <article>
              <span>提示词</span><strong>{{ formatNumber(projectDetail.aiPromptTokens) }}</strong>
            </article>
            <article>
              <span>生成量</span><strong>{{ formatNumber(projectDetail.aiCompletionTokens) }}</strong>
            </article>
            <article class="accent">
              <span>总 Token</span><strong>{{ formatNumber(projectDetail.aiTotalTokens) }}</strong>
            </article>
          </section>

          <section class="project-detail-section">
            <div class="detail-section-heading">
              <span><User />所有者与存储</span>
            </div>
            <div class="project-owner-profile">
              <UserAvatar :avatar="projectDetail.userAvatar" />
              <div>
                <strong>{{ projectDetail.userNickname || projectDetail.account }}</strong
                ><small>@{{ projectDetail.account }} · ID {{ projectDetail.userId }}</small>
              </div>
              <span v-if="projectDetail.userRole" class="role-chip" :class="`role-chip--${projectDetail.userRole}`">{{ ROLE_LABEL[projectDetail.userRole] }}</span>
            </div>
            <div class="storage-key-row">
              <span>用户存储目录键</span><code>{{ projectDetail.userStorageKey }}</code>
            </div>
          </section>

          <section class="project-detail-section">
            <div class="detail-section-heading">
              <span><Connection />运行与部署</span>
            </div>
            <dl class="project-facts">
              <div>
                <dt>项目目录</dt>
                <dd>
                  <code>{{ projectDetail.dirPath || '—' }}</code>
                </dd>
              </div>
              <div>
                <dt>当前版本</dt>
                <dd>{{ projectDetail.currentVision ?? '—' }}</dd>
              </div>
              <div>
                <dt>模板版本</dt>
                <dd>{{ projectDetail.tempVersion || '—' }}</dd>
              </div>
              <div>
                <dt>Cloudflare ID</dt>
                <dd>
                  <code>{{ projectDetail.cloudflareId || '—' }}</code>
                </dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{{ formatDateTime(projectDetail.createdAt) }}</dd>
              </div>
              <div>
                <dt>最近更新</dt>
                <dd>{{ formatDateTime(projectDetail.updateTime) }}</dd>
              </div>
              <div v-if="projectDetail.deletedAt">
                <dt>归档时间</dt>
                <dd>{{ formatDateTime(projectDetail.deletedAt) }}</dd>
              </div>
            </dl>
            <a v-if="projectDetail.link" class="project-open-link" :href="projectDetail.link" target="_blank" rel="noopener">
              <el-icon><Link /></el-icon><span>打开项目</span>
            </a>
          </section>

          <section class="project-detail-section conversation-section">
            <div class="detail-section-heading">
              <span><Collection />会话元数据</span><small>{{ projectDetail.conversations.pagination.total ?? projectDetail.conversations.list.length }} 个会话</small>
            </div>
            <div v-if="projectDetail.conversations.list.length" class="conversation-list">
              <article v-for="conversation in projectDetail.conversations.list" :key="conversation.id">
                <header>
                  <div>
                    <strong>{{ conversation.title || '未命名会话' }}</strong
                    ><small>ID {{ conversation.id }} · {{ formatDateTime(conversation.updatedAt) }} 更新</small>
                  </div>
                  <span class="conversation-status" :class="{ deleted: conversation.status === 'deleted' }">{{ conversation.status === 'deleted' ? '已删除' : '进行中' }}</span>
                </header>
                <div class="conversation-token-row">
                  <span
                    >提示词 <strong>{{ formatNumber(conversation.promptTokens) }}</strong></span
                  >
                  <span
                    >生成量 <strong>{{ formatNumber(conversation.completionTokens) }}</strong></span
                  >
                  <span
                    >总计 <strong>{{ formatNumber(conversation.totalTokens) }}</strong></span
                  >
                </div>
                <div class="context-usage">
                  <div>
                    <span>上下文占用</span><strong>{{ formatNumber(conversation.currentContextTokens) }} / {{ formatNumber(conversation.contextLimit) }}</strong>
                  </div>
                  <div class="chart-track"><i :style="{ width: `${conversationContextPercent(conversation)}%` }" /></div>
                </div>
                <footer>
                  <span>压缩至 Session {{ conversation.summarizedUntilSessionId ?? '—' }}</span
                  ><span>最近压缩 {{ formatDateTime(conversation.lastCompressedAt) }}</span>
                </footer>
              </article>
            </div>
            <div v-else class="detail-empty">该项目还没有会话记录</div>
            <el-pagination
              v-if="(projectDetail.conversations.pagination.total ?? 0) > PAGE_SIZE"
              v-model:current-page="projectConversationPage"
              :page-size="PAGE_SIZE"
              layout="prev, pager, next"
              :total="projectDetail.conversations.pagination.total ?? 0"
              :disabled="projectDetailLoading"
              @current-change="loadProjectConversations"
            />
          </section>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped src="./admin.css"></style>
