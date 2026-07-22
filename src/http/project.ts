import axios, { fetchWithAuth, showRequestError } from '@/ajax'
import type { BuildDoneResult } from '@/builder/build/buildTypes'
import { consumeSseResponse, type SseEvent } from '@/http/sse'

/** 项目类型：工具 / 2D 游戏 / 3D 游戏 */
export type ProjectType = 'tool' | '2d' | '3d'

interface createProjectParams {
  title: string
  desc: string
  /** 项目类型 */
  type: ProjectType
}

export interface projectItem {
  id: number
  account: string
  dirPath: string
  title: string
  desc: string
  /** 项目类型 */
  type: ProjectType
  link: string
  currentVersion: string
  createdAt: string
}

export const createProject = (data: createProjectParams): Promise<{ id: number; dirPath: string }> => {
  return axios.post('/project/create', data)
}

export const getProjectList = (): Promise<projectItem[]> => {
  return axios.get('/project/list')
}

export const deleteProject = (data: { id: number }): Promise<{ content: string }> => {
  return axios.post(`/project/delete`, data)
}

/** 更新项目参数 */
export interface updateProjectBody {
  id: number
  title: string
  desc?: string
  /** 模板版本号 */
  tempVersion?: string
}

export const updateProject = (data: updateProjectBody): Promise<{ content: string }> => {
  return axios.patch(`/project/update`, data)
}

export const getProjectVersion = (params: { projectId: number }): Promise<{ version: string; desc: string }> => {
  return axios.get(`/project/version`, { params })
}

/** 构建部署完成结果 */
export type BuildProjectResult = BuildDoneResult

/** 流式构建参数 */
export interface BuildProjectStreamOptions {
  /** 项目根目录 */
  dir: string
  /** 项目 id */
  projectId: number
  /** 每解析到一个 SSE 事件时回调 */
  onEvent?: (event: SseEvent) => void
  /** 中止信号 */
  signal?: AbortSignal
}

/**
 * 构建项目并部署（SSE 流式）
 * @param options 请求参数与事件回调
 */
export async function buildProjectStream(options: BuildProjectStreamOptions): Promise<void> {
  const { dir, projectId, onEvent, signal } = options

  const response = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/project/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dir, projectId }),
    signal,
  })

  if (!response.ok) {
    const message = `构建请求失败（${response.status}）`
    showRequestError(message)
    throw new Error(message)
  }

  await consumeSseResponse(response, onEvent)
}
