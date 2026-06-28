import type { BuildDoneResult, BuildStepInfo } from './buildTypes'

/**
 * 判断是否为构建步骤数据
 * @param data SSE data 字段
 */
export function isBuildStepInfo(data: unknown): data is BuildStepInfo {
  if (!data || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  return typeof record.key === 'string' && typeof record.title === 'string' && typeof record.status === 'string'
}

/**
 * 解析构建完成结果
 * @param data SSE data 字段（对象或 JSON 字符串）
 */
export function parseBuildDoneResult(data: unknown): BuildDoneResult | null {
  if (!data) return null

  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as BuildDoneResult
    } catch {
      return null
    }
  }

  if (typeof data === 'object') {
    return data as BuildDoneResult
  }

  return null
}

/**
 * 从步骤信息拼接可展示的详情文本
 * @param step 构建步骤
 */
export function getBuildStepDetailText(step: BuildStepInfo): string {
  const parts: string[] = []

  if (step.command) {
    parts.push(`命令：${step.command}`)
  }
  if (step.error) {
    parts.push(`错误：\n${step.error}`)
  }
  if (step.stdout) {
    parts.push(`输出：\n${step.stdout}`)
  }
  if (step.stderr) {
    parts.push(`stderr：\n${step.stderr}`)
  }

  return parts.join('\n\n')
}

/**
 * 判断步骤是否有可展开的详情
 * @param step 构建步骤
 */
export function hasBuildStepDetail(step: BuildStepInfo): boolean {
  return Boolean(step.command || step.error || step.stdout || step.stderr)
}
