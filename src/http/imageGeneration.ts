import axios, { fetchWithAuth, showRequestError } from '@/ajax'
import { consumeSseResponse, type SseEvent } from '@/http/sse'

export type ImageGenerationStatus =
  | 'queued'
  | 'submitted'
  | 'generating'
  | 'storing'
  | 'succeeded'
  | 'failed'

export interface ImageGenerationTask {
  taskId: number
  account: string
  projectId: number | null
  conversationId: number | null
  assistantSessionId: number | null
  toolCallId: string | null
  model: string
  prompt: string
  negativePrompt: string | null
  referenceImages: string[]
  imageSize: string
  status: ImageGenerationStatus
  temporaryUrl: string | null
  contentType: string | null
  originalSize: number | null
  storedSize: number | null
  width: number | null
  height: number | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  source: 'ai_generated'
  /** COS 签名地址，仅成功任务存在 */
  url?: string
}

export interface CreateImageGenerationBody {
  prompt: string
  projectId: number
  imageUrls?: string[]
  negativePrompt?: string
  /** auto 由模型推荐尺寸；自定义尺寸格式为“宽*高”。 */
  size?: 'auto' | `${number}*${number}`
}

export interface ImageGenerationPage {
  list: ImageGenerationTask[]
  pagination: {
    page: number
    pageSize: number
    hasMore: boolean
  }
}

export interface ImageGenerationSseEvent extends SseEvent {
  event: 'status' | 'generated' | 'stored' | 'done' | 'error'
  data: Partial<ImageGenerationTask> & {
    taskId?: number
    temporaryUrl?: string
    message?: string
  }
}

/** 创建生图任务；接口会立即返回任务记录，不等待图片完成。 */
export const createImageGeneration = (
  data: CreateImageGenerationBody,
): Promise<ImageGenerationTask> => axios.post('/agent/image-gen', data)

/** 分页获取当前项目的历史生图任务。 */
export const getImageGenerationTasks = (params: {
  projectId?: number
  conversationId?: number
  assistantSessionId?: number
  page: number
  pageSize: number
}): Promise<ImageGenerationPage> => axios.get('/agent/image-gen/tasks', { params })

/** 查询单个任务快照。 */
export const getImageGenerationTask = (taskId: number): Promise<ImageGenerationTask> =>
  axios.get(`/agent/image-gen/tasks/${taskId}`)

/** 订阅或重连生图任务，使用 fetch 以便携带 Bearer Token。 */
export async function reconnectImageGenerationTask(options: {
  taskId: number
  onEvent?: (event: ImageGenerationSseEvent) => void
  signal?: AbortSignal
}): Promise<void> {
  const { taskId, onEvent, signal } = options
  const response = await fetchWithAuth(
    `${import.meta.env.VITE_API_URL}/agent/image-gen/tasks/${taskId}/stream`,
    { method: 'GET', signal },
  )

  if (!response.ok) {
    const message = `生图任务连接失败（${response.status}）`
    showRequestError(message)
    throw new Error(message)
  }

  await consumeSseResponse(response, (event) => {
    onEvent?.(event as ImageGenerationSseEvent)
  })
}
