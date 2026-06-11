import { WebContainer, type WebContainerProcess } from '@webcontainer/api'
import { buildProjectTempFileTree } from './projectTempFiles'

/** WebContainer 单例实例 */
let webcontainerInstance: WebContainer | null = null

/** 启动中的 Promise，避免重复 boot */
let bootPromise: Promise<WebContainer> | null = null

/** projectTemp 预览地址缓存 */
let cachedPreviewUrl: string | null = null

/**
 * 获取 WebContainer 单例实例
 */
async function getWebContainerInstance(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return webcontainerInstance
  }

  if (!bootPromise) {
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
 * 在 WebContainer 中启动 projectTemp 开发服务器
 * @param onStatus 状态回调
 * @returns 预览地址
 */
export async function startProjectTempPreview(onStatus?: (status: string) => void): Promise<string> {
  if (cachedPreviewUrl) {
    return cachedPreviewUrl
  }

  onStatus?.('正在初始化预览环境...')
  const instance = await getWebContainerInstance()

  onStatus?.('正在挂载项目文件...')
  await instance.mount(buildProjectTempFileTree())

  onStatus?.('正在安装依赖...')
  const installProcess = await instance.spawn('pnpm', ['install'])
  pipeProcessOutput(installProcess, 'pnpm install')
  const installExitCode = await installProcess.exit
  if (installExitCode !== 0) {
    throw new Error('依赖安装失败')
  }

  onStatus?.('正在启动开发服务器...')

  return new Promise<string>((resolve, reject) => {
    instance.on('server-ready', (_port, url) => {
      cachedPreviewUrl = url
      resolve(url)
    })

    void instance
      .spawn('pnpm', ['run', 'dev'])
      .then((devProcess) => {
        pipeProcessOutput(devProcess, 'pnpm run dev')
      })
      .catch(reject)
  })
}
