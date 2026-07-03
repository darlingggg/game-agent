/** 构建步骤状态 */
export type BuildStepStatus = 'running' | 'done' | 'error'

/** 构建步骤信息（SSE step 事件） */
export interface BuildStepInfo {
  /** 步骤标识 */
  key: string
  /** 步骤标题 */
  title: string
  /** 步骤状态 */
  status: BuildStepStatus
  /** 执行命令 */
  command?: string
  /** 状态说明 */
  message?: string
  /** 耗时（毫秒） */
  duration?: number
  /** 耗时文案 */
  durationText?: string
  /** 错误信息 */
  error?: string
  /** 退出码 */
  code?: number
  /** 标准输出 */
  stdout?: string
  /** 标准错误 */
  stderr?: string
  /** 项目路径 */
  projectPath?: string
  /** Cloudflare 项目名称 */
  projectName?: string
}

/** 构建部署结果中的 deploy 信息 */
export interface BuildDeployInfo {
  url?: string | null
  deploymentId?: string | null
  projectName?: string
  stdout?: string
  stderr?: string
}

/** 构建部署完成结果（SSE done 事件） */
export interface BuildDoneResult {
  success: boolean
  code: number
  summary?: string
  link?: string | null
  deploymentId?: string | null
  projectName?: string
  projectPath?: string
  distPath?: string
  completedAt?: string
  duration?: number
  durationText?: string
  steps?: BuildStepInfo[]
  deploy?: BuildDeployInfo
  stdout?: string
  stderr?: string
}

/** 带 UI 展开状态的构建步骤 */
export interface BuildStepView extends BuildStepInfo {
  /** 是否展开详情 */
  expanded: boolean
}
