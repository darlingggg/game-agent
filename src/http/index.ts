export interface Response<T> {
  code: number
  message: string
  data?: T
}

export * from './user'
export * from './project'
export * from './file'
export * from './session'
export * from './cos'
export * from './admin'
export * from './imageGeneration'
