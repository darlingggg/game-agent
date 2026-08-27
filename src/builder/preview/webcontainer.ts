import { ref } from 'vue'
import { WebContainer, type WebContainerProcess } from '@webcontainer/api'
import { assertCrossOriginIsolated } from '@/utils/crossOriginIsolation'
import type { ProjectTempFileContents } from '../file/projectTempFiles'
import { buildProjectTempFileTree } from './projectTempFiles'

/** WebContainer 单例实例 */
let webcontainerInstance: WebContainer | null = null

/** 启动中的 Promise，避免重复 boot */
let bootPromise: Promise<WebContainer> | null = null

/** projectTemp 预览地址缓存 */
let cachedPreviewUrl: string | null = null

/** 预览启动中的 Promise，避免重复安装依赖和启动 dev */
let previewStartPromise: Promise<string> | null = null

/** 预览会话 id，切换项目时递增以作废进行中的启动任务 */
let previewSessionId = 0

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
    bootPromise = WebContainer.boot().then((instance) => {
      webcontainerInstance = instance
      return instance
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
  )
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
 * 销毁 WebContainer 并清除预览缓存，切换项目时调用
 */
export function resetProjectTempPreview(): void {
  previewSessionId++
  previewStartPromise = null
  cachedPreviewUrl = null
  bootPromise = null

  if (webcontainerInstance) {
    try {
      webcontainerInstance.teardown()
    } catch (error) {
      console.warn('[WebContainer] teardown 失败', error)
    }
    webcontainerInstance = null
  }
}

/**
 * 在 WebContainer 中启动 projectTemp 开发服务器
 * @param onStatus 状态回调
 * @param sessionId 启动时的会话 id，用于检测项目切换
 * @returns 预览地址
 */
async function bootProjectTempPreview(
  onStatus?: (status: string) => void,
  sessionId = previewSessionId,
): Promise<string> {
  assertPreviewSessionActive(sessionId)

  onStatus?.('正在初始化预览环境...')
  const instance = await getWebContainerInstance()
  assertPreviewSessionActive(sessionId)

  onStatus?.('正在挂载项目文件...')
  await instance.mount(await buildProjectTempFileTree())
  assertPreviewSessionActive(sessionId)

  const devScript = await resolveDevScript(instance)

  onStatus?.('正在安装依赖...')
  const installProcess = await instance.spawn('pnpm', ['install'])
  pipeProcessOutput(installProcess, 'pnpm install')
  const installExitCode = await installProcess.exit
  assertPreviewSessionActive(sessionId)
  if (installExitCode !== 0) {
    throw new Error('依赖安装失败')
  }

  onStatus?.('正在启动开发服务器...')

  return new Promise<string>((resolve, reject) => {
    let settled = false

    const finish = (handler: () => void) => {
      if (settled) return
      settled = true
      handler()
    }

    instance.on('server-ready', (_port, url) => {
      finish(() => {
        if (sessionId !== previewSessionId) return
        cachedPreviewUrl = url
        resolve(url)
      })
    })

    void instance
      .spawn('pnpm', ['run', 'dev'])
      .then(async (devProcess) => {
        pipeProcessOutput(devProcess, 'pnpm run dev')
        const exitCode = await devProcess.exit
        if (sessionId !== previewSessionId) return
        if (exitCode !== 0) {
          finish(() => {
            reject(
              new Error(
                `开发服务器启动失败（退出码 ${exitCode}），请检查 package.json 的 scripts.dev（当前: ${devScript}）`,
              ),
            )
          })
        }
      })
      .catch((error: unknown) => {
        if (sessionId !== previewSessionId) return
        finish(() => {
          reject(error instanceof Error ? error : new Error('开发服务器启动失败'))
        })
      })
  })
}

/**
 * 在 WebContainer 中启动 projectTemp 开发服务器
 * @param onStatus 状态回调
 * @returns 预览地址
 */
export async function startProjectTempPreview(onStatus?: (status: string) => void): Promise<string> {
  if (cachedPreviewUrl) {
    return cachedPreviewUrl
  }

  const sessionId = previewSessionId

  if (!previewStartPromise) {
    previewStartPromise = bootProjectTempPreview(onStatus, sessionId).catch((error) => {
      previewStartPromise = null
      throw error
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
  if (!webcontainerInstance || !shouldSyncPreviewFile(relativePath)) {
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
  if (!webcontainerInstance || !shouldSyncPreviewFile(relativePath)) {
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
export async function refreshProjectTempPreview(onStatus?: (status: string) => void): Promise<void> {
  if (!webcontainerInstance || !cachedPreviewUrl) {
    await startProjectTempPreview(onStatus)
    return
  }

  onStatus?.('正在刷新预览...')
  await webcontainerInstance.mount(await buildProjectTempFileTree())
  onStatus?.('')
}
