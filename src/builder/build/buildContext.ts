import { inject, ref, type InjectionKey, type Ref } from 'vue'
import type { SseEvent } from '@/http/sse'
import { getBuildStepDetailText, isBuildStepInfo, parseBuildDoneResult } from './buildEvent'
import type { BuildDoneResult, BuildStepInfo, BuildStepView } from './buildTypes'

/** 构建日志上下文 */
export interface BuildContext {
  /** 悬浮框是否可见 */
  visible: Ref<boolean>
  /** 悬浮框是否收起（仅保留标题栏） */
  collapsed: Ref<boolean>
  /** 是否正在构建 */
  running: Ref<boolean>
  /** 构建文本日志（每行一条 SSE text） */
  content: Ref<string>
  /** 构建步骤列表 */
  steps: Ref<BuildStepView[]>
  /** 构建结果摘要 */
  summary: Ref<string>
  /** 部署访问链接 */
  resultLink: Ref<string>
  /** 总耗时文案 */
  durationText: Ref<string>
  /** Deployment ID */
  deploymentId: Ref<string>
  /** 构建完成信号，用于刷新版本信息等 */
  buildCompletedSignal: Ref<number>
  /** 当前项目快照版本数量 */
  snapshotVersionCount: Ref<number>
  /** 更新快照版本数量 */
  setSnapshotVersionCount: (count: number) => void
  /** 打开悬浮框并开始新一轮构建 */
  openForBuild: () => void
  /** 处理构建 SSE 事件，done 时返回解析结果 */
  handleBuildEvent: (event: SseEvent) => BuildDoneResult | null
  /** 切换步骤详情展开 */
  toggleStepExpand: (key: string) => void
  /** 标记构建结束 */
  finishBuild: () => void
  /** 关闭悬浮框 */
  closePanel: () => void
  /** 切换收起/展开 */
  toggleCollapsed: () => void
}

/** 构建上下文注入 key */
export const buildContextKey: InjectionKey<BuildContext> = Symbol('buildContext')

/**
 * 创建构建日志上下文（在 Builder 根组件中初始化）
 */
export function createBuildContext(): BuildContext {
  const visible = ref(false)
  const collapsed = ref(false)
  const running = ref(false)
  const content = ref('')
  const steps = ref<BuildStepView[]>([])
  const summary = ref('')
  const resultLink = ref('')
  const durationText = ref('')
  const deploymentId = ref('')
  const buildCompletedSignal = ref(0)
  const snapshotVersionCount = ref(0)

  function setSnapshotVersionCount(count: number) {
    snapshotVersionCount.value = count
  }

  function resetBuildState() {
    content.value = ''
    steps.value = []
    summary.value = ''
    resultLink.value = ''
    durationText.value = ''
    deploymentId.value = ''
  }

  function openForBuild() {
    visible.value = true
    collapsed.value = false
    running.value = true
    resetBuildState()
  }

  function appendLine(text: string) {
    const line = text.trim()
    if (!line) return
    content.value += `${line}\n`
  }

  /**
   * 将仍处于 running 的步骤标记为 done（后端可能未单独推送完成事件）
   */
  function markRunningStepsDone(excludeKey?: string) {
    steps.value = steps.value.map((item) =>
      item.status === 'running' && item.key !== excludeKey
        ? { ...item, status: 'done' }
        : item,
    )
  }

  /**
   * 更新或追加构建步骤
   * @param step 步骤数据
   */
  function upsertStep(step: BuildStepInfo) {
    // 新步骤开始或某步骤完成时，自动结束之前未关闭的步骤
    if (step.status === 'running' || step.status === 'done') {
      markRunningStepsDone(step.status === 'running' ? step.key : undefined)
    }

    const index = steps.value.findIndex((item) => item.key === step.key)
    if (index >= 0) {
      const prev = steps.value[index]!
      steps.value[index] = {
        ...prev,
        ...step,
        expanded: prev.expanded,
      }
      return
    }

    steps.value.push({
      ...step,
      expanded: false,
    })
  }

  /**
   * 处理 done 事件并写入摘要
   * @param data SSE data
   */
  function applyDoneResult(data: unknown): BuildDoneResult | null {
    const result = parseBuildDoneResult(data)
    if (!result) return null

    if (result.summary) {
      summary.value = result.summary
    }

    const link = result.link || result.deploy?.url || ''
    if (link) {
      resultLink.value = link
    }

    if (result.durationText) {
      durationText.value = result.durationText
    }

    const deployId = result.deploymentId || result.deploy?.deploymentId || ''
    if (deployId) {
      deploymentId.value = deployId
    }

    if (result.steps?.length) {
      for (const step of result.steps) {
        upsertStep(step)
      }
    }

    if (summary.value) {
      appendLine(summary.value)
    }
    if (resultLink.value) {
      appendLine(`访问链接：${resultLink.value}`)
    }
    if (deploymentId.value) {
      appendLine(`Deployment ID：${deploymentId.value}`)
    }

    return result
  }

  function handleBuildEvent(event: SseEvent): BuildDoneResult | null {
    if (event.event === 'text' && typeof event.data === 'string') {
      appendLine(event.data)
      return null
    }

    if (event.event === 'step' && isBuildStepInfo(event.data)) {
      upsertStep(event.data)
      return null
    }

    if (event.event === 'done') {
      return applyDoneResult(event.data)
    }

    return null
  }

  function toggleStepExpand(key: string) {
    const target = steps.value.find((item) => item.key === key)
    if (!target) return
    target.expanded = !target.expanded
  }

  function finishBuild() {
    markRunningStepsDone()
    running.value = false
    buildCompletedSignal.value += 1
  }

  function closePanel() {
    visible.value = false
    collapsed.value = false
    running.value = false
    resetBuildState()
  }

  function toggleCollapsed() {
    collapsed.value = !collapsed.value
  }

  return {
    visible,
    collapsed,
    running,
    content,
    steps,
    summary,
    resultLink,
    durationText,
    deploymentId,
    buildCompletedSignal,
    snapshotVersionCount,
    setSnapshotVersionCount,
    openForBuild,
    handleBuildEvent,
    toggleStepExpand,
    finishBuild,
    closePanel,
    toggleCollapsed,
  }
}

/**
 * 获取构建上下文
 */
export function useBuildContext(): BuildContext {
  const context = inject(buildContextKey)
  if (!context) {
    throw new Error('BuildContext 未注入，请在 Builder 根组件中 provide')
  }
  return context
}
