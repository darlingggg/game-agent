import axios from '@/ajax'

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
