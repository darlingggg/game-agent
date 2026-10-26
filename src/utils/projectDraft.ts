/** 首页创作入口与工作台之间的一次性需求草稿。 */
interface ProjectPromptDraft {
  projectId: number
  prompt: string
}

const STORAGE_KEY = 'gameagent-project-prompt'
let memoryDraft: ProjectPromptDraft | null = null

/** 从首句描述提取名称；创建弹窗仍允许用户修改。 */
export function suggestProjectTitle(prompt: string): string {
  const firstSentence =
    prompt
      .trim()
      .split(/[\r\n。！？!?]/)[0]
      ?.trim() ?? ''
  const title = firstSentence
    .replace(/^(?:(?:请|帮我|给我|我想要?|想要|需要|做|制作|创建|开发|设计|实现|一个|一款|一套|个)\s*)+/, '')
    .replace(/^[“”「」『』"'\s]+|[“”「」『』"'\s]+$/g, '')
    .trim()
  return (title || '新项目').slice(0, 20)
}

export function saveProjectPrompt(projectId: number, prompt: string): void {
  memoryDraft = { projectId, prompt: prompt.trim() }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryDraft))
  } catch {
    // 浏览器禁用存储时，仍能在当前页面导航中传递需求。
  }
}

/** 仅目标项目可消费草稿；消费后刷新不会重复发送。 */
export function takeProjectPrompt(projectId: number): string {
  let draft = memoryDraft
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ProjectPromptDraft>
      if (Number.isSafeInteger(parsed.projectId) && typeof parsed.prompt === 'string') {
        draft = parsed as ProjectPromptDraft
      }
    }
  } catch {
    // 无效的本地草稿不阻断项目打开。
  }
  if (draft?.projectId !== projectId) return ''
  memoryDraft = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 内存草稿已清理。
  }
  return draft.prompt
}

/** 让相同类型的项目也拥有稳定的独立配色。 */
export function projectCardHue(projectId: number): number {
  const hues = [218, 163, 28, 272, 192, 344]
  return hues[Math.abs(Math.trunc(projectId)) % hues.length] ?? 218
}
