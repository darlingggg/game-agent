import { ref } from 'vue'
import { WebContainer, type WebContainerProcess } from '@webcontainer/api'
import { assertCrossOriginIsolated } from '@/utils/crossOriginIsolation'
import { pinia } from '@/stores'
import { useProjectStore } from '@/stores/project'
import type { ProjectTempFileContents } from '../file/projectTempFiles'
import { buildProjectTempFileTree } from './projectTempFiles'

/** WebContainer 单例实例 */
let webcontainerInstance: WebContainer | null = null

/** 启动中的 Promise，避免重复 boot */
let bootPromise: Promise<WebContainer> | null = null

/** WebContainer 的隐藏 iframe 加载失败时不会自行拒绝启动 Promise */
const BOOT_TIMEOUT_MS = 30_000

export class PreviewBootTimeoutError extends Error {
  constructor() {
    super('预览环境初始化超时，请检查网络或代理后重试')
    this.name = 'PreviewBootTimeoutError'
  }
}

export type PreviewPhase = 'preparing' | 'initializing' | 'mounting' | 'installing' | 'starting' | 'refreshing' | 'ready'
type PreviewStatusCallback = (status: string, phase: PreviewPhase) => void

/** projectTemp 预览地址缓存 */
let cachedPreviewUrl: string | null = null

/** 预览启动中的 Promise，避免重复安装依赖和启动 dev */
let previewStartPromise: Promise<string> | null = null

/** 预览会话 id，切换项目时递增以作废进行中的启动任务 */
let previewSessionId = 0

/** 串行处理项目切换，避免旧项目挂载与新项目安装交错 */
let previewTaskQueue: Promise<void> = Promise.resolve()
let previewAbortController = new AbortController()
let processStopPromise: Promise<void> = Promise.resolve()
let installProcess: WebContainerProcess | null = null
let devProcess: WebContainerProcess | null = null
let mountedProjectId: number | null = null

/** 不挂载到 WebContainer 的文件或目录，保存时无需同步预览 */
const PREVIEW_EXCLUDED_PATHS = [
  '.vscode/',
  '.gitignore',
  'README.md',
  'public/favicon.ico',
]

/** Tailwind CSS 入口文件路径 */
const PREVIEW_CSS_ENTRY = 'styles/index.css'

/** 会触发 Tailwind 重新扫描 content 的文件类型 */
const TAILWIND_CONTENT_FILE = /\.(vue|html|jsx|tsx|js|ts)$/i

/** 预览 iframe 重载信号（写入文件后通知 PreviewPanel 刷新 iframe） */
export const previewIframeReloadSignal = ref(0)

/** iframe 重载防抖定时器 */
let iframeReloadTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 获取 WebContainer 单例实例
 */
async function getWebContainerInstance(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return webcontainerInstance
  }

  if (!bootPromise) {
    assertCrossOriginIsolated()
    bootPromise = WebContainer.boot()
      .then((instance) => {
        webcontainerInstance = instance
        return instance
      })
      .catch((error: unknown) => {
        bootPromise = null
        throw error
      })
  }

  return bootPromise
}

/**
 * 将进程输出写入控制台，便于排查问题
 * @param process WebContainer 进程
 * @param label 日志前缀
 */
function pipeProcessOutput(process: WebContainerProcess, label: string) {
  void process.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(`[${label}]`, data)
      },
    }),
  ).catch((error: unknown) => {
    console.warn(`[${label}] 输出流已中断`, error)
  })
}

/**
 * 从 WebContainer 中读取 package.json 并解析 dev 启动脚本
 * @param instance WebContainer 实例
 */
async function resolveDevScript(instance: WebContainer): Promise<string> {
  let packageJson = ''
  try {
    packageJson = await instance.fs.readFile('package.json', 'utf-8')
  } catch {
    throw new Error('未找到 package.json，无法启动预览')
  }

  let pkg: { scripts?: Record<string, string> }
  try {
    pkg = JSON.parse(packageJson) as { scripts?: Record<string, string> }
  } catch {
    throw new Error('package.json 格式无效，无法启动预览')
  }

  const devScript = pkg.scripts?.dev
  if (!devScript) {
    throw new Error('package.json 缺少 scripts.dev，无法启动开发服务器')
  }

  return devScript
}

/**
 * 判断预览启动任务是否已过期（项目已切换）
 * @param sessionId 启动时的会话 id
 */
function assertPreviewSessionActive(sessionId: number): void {
  if (sessionId !== previewSessionId) {
    throw new Error('预览已取消')
  }
}

/**
 * 停止当前项目进程并清除预览缓存，保留 WebContainer 实例供下一个项目复用
 */
export function stopProjectTempPreview(): void {
  previewSessionId++
  previewAbortController.abort()
  previewAbortController = new AbortController()
  if (iframeReloadTimer) {
    clearTimeout(iframeReloadTimer)
    iframeReloadTimer = null
  }
  previewStartPromise = null
  cachedPreviewUrl = null
  mountedProjectId = null

  const processes = [installProcess, devProcess].filter((process): process is WebContainerProcess => process !== null)
  installProcess = null
  devProcess = null
  for (const process of processes) {
    try {
      process.kill()
    } catch (error) {
      console.warn('[WebContainer] 停止旧项目进程失败', error)
    }
  }
  processStopPromise = Promise.all([processStopPromise, ...processes.map((process) => process.exit)]).then(() => {})
}

function queuePreviewTask<T>(task: () => Promise<T>): Promise<T> {
  const result = previewTaskQueue.then(task)
  previewTaskQueue = result.then(() => {}, () => {})
  return result
}

async function waitForWebContainer(signal: AbortSignal): Promise<WebContainer> {
  let bootTimer: ReturnType<typeof setTimeout> | undefined
  let rejectCancellation: (error: Error) => void = () => {}
  const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject })
  const onAbort = () => rejectCancellation(new Error('预览已取消'))
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })

  try {
    return await Promise.race([
      getWebContainerInstance(),
      cancellation,
      new Promise<never>((_, reject) => {
        bootTimer = setTimeout(() => reject(new PreviewBootTimeoutError()), BOOT_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(bootTimer)
    signal.removeEventListener('abort', onAbort)
  }
}

async function startDevServer(
  instance: WebContainer,
  devScript: string,
  assertCurrent: () => void,
  signal: AbortSignal,
): Promise<string> {
  let resolveReady: (url: string) => void = () => {}
  let rejectReady: (error: Error) => void = () => {}
  const ready = new Promise<string>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  void ready.catch(() => {})

  const unsubscribe = instance.on('server-ready', (_port, url) => resolveReady(url))
  const onAbort = () => rejectReady(new Error('预览已取消'))
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    const spawned = await instance.spawn('pnpm', ['run', 'dev'])
    try {
      assertCurrent()
    } catch (error) {
      spawned.kill()
      await spawned.exit
      throw error
    }

    devProcess = spawned
    pipeProcessOutput(spawned, 'pnpm run dev')
    const exited = spawned.exit.then((code) => {
      if (devProcess === spawned) devProcess = null
      return { kind: 'exit' as const, code }
    })
    const result = await Promise.race([
      ready.then((url) => ({ kind: 'ready' as const, url })),
      exited,
    ])
    assertCurrent()
    if (result.kind === 'exit') {
      throw new Error(`开发服务器启动失败（退出码 ${result.code}），请检查 package.json 的 scripts.dev（当前: ${devScript}）`)
    }

    cachedPreviewUrl = result.url
    return result.url
  } finally {
    unsubscribe()
    signal.removeEventListener('abort', onAbort)
  }
}

/**
 * 在 WebContainer 中启动 projectTemp 开发服务器
 * @param onStatus 状态回调
 * @param sessionId 启动时的会话 id，用于检测项目切换
 * @returns 预览地址
 */
async function bootProjectTempPreview(
  onStatus?: PreviewStatusCallback,
  sessionId = previewSessionId,
  projectId = useProjectStore(pinia).currentProject?.id,
  signal = previewAbortController.signal,
): Promise<string> {
  const assertCurrent = () => {
    assertPreviewSessionActive(sessionId)
    if (signal.aborted || useProjectStore(pinia).currentProject?.id !== projectId) {
      throw new Error('预览已取消')
    }
  }
  assertCurrent()

  onStatus?.('正在初始化预览环境...', 'initializing')
  const instance = await waitForWebContainer(signal)
  await processStopPromise
  assertCurrent()

  onStatus?.('正在挂载项目文件...', 'mounting')
  const tree = await buildProjectTempFileTree(assertCurrent)
  assertCurrent()
  const oldEntries = await instance.fs.readdir('/')
  for (const entry of oldEntries) {
    assertCurrent()
    if (entry !== 'node_modules') {
      await instance.fs.rm(`/${entry}`, { recursive: true, force: true })
    }
  }
  assertCurrent()
  await instance.mount(tree)
  assertCurrent()
  mountedProjectId = projectId ?? null

  const devScript = await resolveDevScript(instance)

  onStatus?.('正在安装依赖...', 'installing')
  const installing = await instance.spawn('pnpm', ['install'])
  installProcess = installing
  if (signal.aborted) installing.kill()
  pipeProcessOutput(installing, 'pnpm install')
  let installExitCode: number
  try {
    installExitCode = await installing.exit
  } finally {
    if (installProcess === installing) installProcess = null
  }
  assertCurrent()
  if (installExitCode !== 0) {
    throw new Error('依赖安装失败')
  }

  onStatus?.('正在启动开发服务器...', 'starting')
  return startDevServer(instance, devScript, assertCurrent, signal)
}

/**
 * 在 WebContainer 中启动 projectTemp 开发服务器
 * @param onStatus 状态回调
 * @returns 预览地址
 */
export async function startProjectTempPreview(onStatus?: PreviewStatusCallback): Promise<string> {
  const projectId = useProjectStore(pinia).currentProject?.id
  if (!projectId) throw new Error('当前项目未就绪')

  if (cachedPreviewUrl && mountedProjectId === projectId) {
    return cachedPreviewUrl
  }

  const sessionId = previewSessionId
  const signal = previewAbortController.signal

  if (!previewStartPromise) {
    const task = queuePreviewTask(() => bootProjectTempPreview(onStatus, sessionId, projectId, signal))
    previewStartPromise = task
    void task.catch(() => {
      if (previewStartPromise === task) previewStartPromise = null
    })
  }

  return previewStartPromise
}

/**
 * 判断同步的文件是否会影响 Tailwind 样式生成
 * @param relativePath 相对 projectTemp 根目录的路径
 */
function isTailwindContentFile(relativePath: string): boolean {
  return TAILWIND_CONTENT_FILE.test(relativePath) || relativePath.includes('tailwind.config')
}

/**
 * 触发 Tailwind CSS 重新编译
 * WebContainer 内 writeFile 更新 .vue 时，Vite 只会 HMR 组件，PostCSS 不会重新扫描 class
 */
async function invalidateTailwindPreview(): Promise<void> {
  if (!webcontainerInstance) return

  try {
    const cssPath = `/${PREVIEW_CSS_ENTRY}`
    const content = await webcontainerInstance.fs.readFile(cssPath, 'utf-8')
    const cleaned = content.replace(/\/\* preview-sync:\d+ \*\/\n?/g, '')
    await webcontainerInstance.fs.writeFile(cssPath, `/* preview-sync:${Date.now()} */\n${cleaned}`)
  } catch (error) {
    console.warn('[Preview] Tailwind CSS 刷新失败', error)
  }
}

/**
 * 防抖触发预览 iframe 重载，避免 AI 连续写多个文件时频繁刷新
 * @param delay 防抖延迟（毫秒）
 */
export function requestPreviewIframeReloadDebounced(delay = 400): void {
  if (iframeReloadTimer) {
    clearTimeout(iframeReloadTimer)
  }
  iframeReloadTimer = setTimeout(() => {
    iframeReloadTimer = null
    previewIframeReloadSignal.value += 1
  }, delay)
}
/**
 * 判断文件是否需要同步到预览环境
 * @param relativePath 相对 projectTemp 根目录的路径
 */
function shouldSyncPreviewFile(relativePath: string): boolean {
  return !PREVIEW_EXCLUDED_PATHS.some((item) => relativePath.includes(item))
}

/**
 * 从 WebContainer 中删除文件
 * @param relativePath 相对 projectTemp 根目录的路径
 */
export async function removePreviewFile(relativePath: string): Promise<void> {
  if (!webcontainerInstance || mountedProjectId !== useProjectStore(pinia).currentProject?.id || !shouldSyncPreviewFile(relativePath)) {
    return
  }

  const webPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`

  try {
    await webcontainerInstance.fs.rm(webPath)
  } catch (error) {
    console.warn('[Preview] 删除文件失败', relativePath, error)
  }
}

/**
 * 将已保存的文件同步到 WebContainer，触发 Vite 热更新
 * @param relativePath 相对 projectTemp 根目录的路径
 * @param content 文件内容
 */
export async function syncPreviewFile(relativePath: string, content: ProjectTempFileContents): Promise<void> {
  if (!webcontainerInstance || mountedProjectId !== useProjectStore(pinia).currentProject?.id || !shouldSyncPreviewFile(relativePath)) {
    return
  }

  const webPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  await webcontainerInstance.fs.writeFile(webPath, content)

  if (isTailwindContentFile(relativePath)) {
    await invalidateTailwindPreview()
    requestPreviewIframeReloadDebounced()
  }
}

/**
 * 刷新 WebContainer 预览：重新挂载 projectTemp 文件并等待 Vite 热更新
 * @param onStatus 状态回调
 */
export async function refreshProjectTempPreview(onStatus?: PreviewStatusCallback): Promise<void> {
  const projectId = useProjectStore(pinia).currentProject?.id
  const instance = webcontainerInstance
  if (!instance || !cachedPreviewUrl || mountedProjectId !== projectId) {
    await startProjectTempPreview(onStatus)
    return
  }

  const sessionId = previewSessionId
  await queuePreviewTask(async () => {
    const assertCurrent = () => {
      assertPreviewSessionActive(sessionId)
      if (useProjectStore(pinia).currentProject?.id !== projectId) throw new Error('预览已取消')
    }
    assertCurrent()
    onStatus?.('正在刷新预览...', 'refreshing')
    const tree = await buildProjectTempFileTree(assertCurrent)
    assertCurrent()
    await instance.mount(tree)
    assertCurrent()
    onStatus?.('', 'ready')
  })
}
