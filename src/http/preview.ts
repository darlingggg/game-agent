import { fetchWithAuth } from '@/ajax'

export interface PreviewTask {
  id: string
  projectId: number
  revision: string
  status: 'queued' | 'running' | 'ready' | 'failed' | 'superseded'
  phase: string
  error: string
  requestedAt: number
  completedAt: string | null
  queuePosition: number
  result: { link: string; completedAt: string } | null
}

export interface RemotePreviewState {
  desiredRevision: string
  active: PreviewTask | null
  pending: PreviewTask | null
  lastReady: PreviewTask | null
  latest: PreviewTask | null
}

async function requestPreviewState(projectId: number, method: 'GET' | 'POST'): Promise<RemotePreviewState> {
  const url = `${import.meta.env.VITE_API_URL}/project/preview${method === 'GET' ? `?projectId=${projectId}` : ''}`
  const response = await fetchWithAuth(url, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ projectId }) } : {}),
  })
  if (!response.ok) throw new Error(`兼容预览请求失败（HTTP ${response.status}）`)
  const payload = await response.json() as { status: number; message: string; data: RemotePreviewState }
  if (payload.status !== 0) throw new Error(payload.message || '兼容预览请求失败')
  return payload.data
}

export const getRemotePreview = (projectId: number) => requestPreviewState(projectId, 'GET')
export const updateRemotePreview = (projectId: number) => requestPreviewState(projectId, 'POST')
