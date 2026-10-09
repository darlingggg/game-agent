import axios from '@/ajax'

export interface AiModel {
  id: number
  modelKey: string
  modelName: string
  capabilities: {
    contextWindow?: number
    maxOutputTokens?: number
    inputModalities?: string[]
    outputModalities?: string[]
    apiCapabilities?: Record<string, unknown>
  } | null
  effort: { supportedLevels?: string[]; defaultLevel?: string } | null
  enabled: number
  isDefault: number
  createdAt: string
  updatedAt: string
}

export interface ModelSyncResult {
  synced?: number
  disabled?: number
  skipped?: boolean
  reason?: string
  syncedAt?: string
}

export interface AdminModelsData {
  list: AiModel[]
  sync: {
    running: boolean
    source: string | null
    startedAt: string | null
    finishedAt: string | null
    lastError: string | null
    result: ModelSyncResult | null
  }
  nextSyncAt: string
}

export const getAvailableModels = (): Promise<AiModel[]> => axios.get('/models')
export const getAdminModels = (): Promise<AdminModelsData> => axios.get('/admin/models')
export const syncAdminModels = (): Promise<ModelSyncResult> => axios.post('/admin/models/sync')
export const setAdminDefaultModel = (model: string): Promise<{ modelKey: string; isDefault: number }> => axios.patch('/admin/models/default', { model })

export const effortLabel = (level: string) => ({ low: '低', medium: '中', high: '高', max: '最高' })[level] || level
