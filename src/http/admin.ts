import axios from '@/ajax'
import type { UserRole } from './user'

export interface PageData<T> {
  list: T[]
  pagination: {
    page: number
    pageSize: number
    total: number | null
    totalPages: number | null
    hasMore?: boolean
    nextMarker?: string | null
  }
}

export interface AdminListParams {
  page?: number
  pageSize?: number
}

export interface AdminProjectListParams extends AdminListParams {
  userId?: number
  account?: string
}

export interface AdminAssetListParams extends AdminListParams {
  marker?: string
  userId?: number
}

export interface AdminProject {
  id: number
  account: string
  dirPath: string
  title: string
  desc: string
  type: 'tool' | '2d' | '3d'
  link: string | null
  currentVision: number | null
  cloudflareId: string | null
  tempVersion: string
  aiPromptTokens: number
  aiCompletionTokens: number
  aiTotalTokens: number
  createdAt: string
  updateTime: string
  deletedAt: string | null
  isDeleted: 0 | 1
  userId?: number
  userNickname?: string
  userAvatar?: string
  userRole?: UserRole
}

export interface AdminConversation {
  id: number
  account: string
  projectId: number
  title: string
  status: 'active' | 'deleted'
  promptTokens: number
  completionTokens: number
  totalTokens: number
  currentContextTokens: number
  contextLimit: number
  summarizedUntilSessionId: number | null
  lastCompressedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminProjectDetail extends AdminProject {
  userStorageKey: string
  conversations: PageData<AdminConversation>
}

export interface AdminUser {
  id: number
  account: string
  nickname: string
  avatar: string
  qqOpenid: string | null
  wxOpenid: string | null
  role: UserRole
  storageKey: string
  createdAt: string
  lastLoginAt?: string | null
  lastActiveAt?: string | null
  projectCount?: number
  activeProjectCount?: number
  deletedProjectCount?: number
}

export interface AdminDashboardTrend {
  date: string
  newUsers: number
  newProjects: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  modelCalls: number
  failedCalls: number
  storageFileCount: number
  storageBytes: number
  orphanFileCount: number
}

export interface AdminDashboardOverview {
  range: {
    days: 7 | 30
    startDate: string
    endDate: string
    timezone: string
  }
  summary: {
    users: {
      total: number
      newCount: number
      activeCount: number
      disabledCount: number
      roleCounts: Partial<Record<UserRole, number>>
    }
    projects: {
      total: number
      newCount: number
      activeCount: number
      deletedCount: number
      typeCounts: Partial<Record<AdminProject['type'], number>>
    }
    ai: {
      cumulativePromptTokens: number
      cumulativeCompletionTokens: number
      cumulativeTotalTokens: number
      periodPromptTokens: number
      periodCompletionTokens: number
      periodTotalTokens: number
      modelCalls: number
      failedCalls: number
    }
    storage: {
      fileCount: number
      totalBytes: number
      managedFileCount: number
      managedBytes: number
      imageCount: number
      videoCount: number
      otherCount: number
      orphanFileCount: number
      orphanBytes: number
      lastSyncedAt: string | null
      syncStatus: 'never' | 'success' | 'error'
      errorMessage: string | null
    }
  }
  trends: AdminDashboardTrend[]
  rankings: {
    usersByTokens: Array<{
      userId: number
      account: string
      nickname: string
      avatar: string
      totalTokens: number
    }>
    projectsByTokens: Array<{
      projectId: number
      title: string
      account: string
      userNickname: string | null
      userAvatar: string | null
      totalTokens: number
    }>
    usersByStorage: Array<{
      userId: number
      account: string
      nickname: string
      avatar: string
      fileCount: number
      totalBytes: number
      lastSyncedAt: string | null
    }>
  }
  storageSync: {
    running: boolean
    source: string | null
    startedAt: string | null
    finishedAt: string | null
    lastError: string | null
  }
  generatedAt: string
}

export interface AdminStorageSyncResult {
  started: boolean
  running: boolean
  source: string | null
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
}

export interface AdminAsset {
  key: string
  fileName: string
  relativePath: string
  extension: string
  size: number
  etag: string
  storageClass: string | null
  lastModified: string | null
  isDirectory: boolean
  url: string | null
  storageKey: string | null
  userId: number | null
  account: string | null
  userNickname: string | null
}

export interface UpdateAdminUserInput {
  role?: UserRole
  qqOpenid?: string | null | false
  wxOpenid?: string | null | false
}

export const getAdminProjects = (params: AdminProjectListParams = {}): Promise<PageData<AdminProject>> => axios.get('/admin/projects', { params })

export const getAdminProject = (id: number, params: AdminListParams = {}): Promise<AdminProjectDetail> => axios.get(`/admin/projects/${id}`, { params })

export const getAdminUsers = (params: AdminListParams = {}): Promise<PageData<AdminUser>> => axios.get('/admin/users', { params })

export const getAdminUser = (id: number): Promise<AdminUser> => axios.get(`/admin/users/${id}`)

export const updateAdminUser = (id: number, data: UpdateAdminUserInput): Promise<AdminUser> => axios.patch(`/admin/users/${id}`, data)

export const getAdminAssets = (params: AdminAssetListParams = {}): Promise<PageData<AdminAsset>> => axios.get('/admin/assets', { params })

export const getAdminDashboardOverview = (days: 7 | 30 = 30): Promise<AdminDashboardOverview> => axios.get('/admin/dashboard/overview', { params: { days } })

export const syncAdminStorage = (): Promise<AdminStorageSyncResult> => axios.post('/admin/dashboard/storage-sync')
