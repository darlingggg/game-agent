import axios, { getToken } from '@/ajax'
import type { BuildDoneResult } from '@/builder/build/buildTypes'
import { consumeSseResponse, type SseEvent } from '@/http/sse'

interface createProjectParams {
  title: string
  desc: string
}

export interface projectItem {
  id: number
  account: string
  dirPath: string
  title: string
  desc: string
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

export const updateProject = (data: { id: number; title: string; desc?: string }): Promise<{ content: string }> => {
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
  const token = getToken()

  const response = await fetch(`${import.meta.env.VITE_API_URL}/project/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ dir, projectId }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`构建请求失败（${response.status}）`)
  }

  await consumeSseResponse(response, onEvent)
}
