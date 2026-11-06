import type { RemotePreviewState } from '../../http/preview'

interface PreviewApi {
  get: (projectId: number) => Promise<RemotePreviewState>
  update: (projectId: number, force?: boolean) => Promise<RemotePreviewState>
}

/** 每个面板独立管理请求和计时器，避免过期响应更新其他项目的预览。 */
export class RemotePreviewController {
  private epoch = 0
  private projectId = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private submission: Promise<void> | null = null
  private pendingUpdate = false
  private pendingForce = false
  private version = 0
  private api: PreviewApi
  private onState: (state: RemotePreviewState) => void
  private onError: (error: unknown) => void
  private pollInterval: number

  constructor(api: PreviewApi, onState: (state: RemotePreviewState) => void,
    onError: (error: unknown) => void, pollInterval = 2000) {
    this.api = api
    this.onState = onState
    this.onError = onError
    this.pollInterval = pollInterval
  }

  stop() {
    this.epoch++
    this.projectId = 0
    this.pendingUpdate = false
    this.pendingForce = false
    this.submission = null
    clearTimeout(this.timer)
  }

  async start(projectId: number) {
    this.stop()
    this.projectId = projectId
    const epoch = this.epoch
    const version = this.version
    try {
      const state = await this.api.get(projectId)
      if (epoch === this.epoch && version === this.version) this.apply(state)
    } catch (error) {
      if (epoch === this.epoch && version === this.version) this.onError(error)
    }
  }

  update(force = false) {
    if (!this.projectId) return Promise.resolve()
    this.pendingUpdate = true
    this.pendingForce ||= force
    this.version++
    clearTimeout(this.timer)
    if (!this.submission) {
      const epoch = this.epoch
      const pending = this.submit(epoch)
      this.submission = pending
      void pending.finally(() => {
        if (this.submission !== pending) return
        this.submission = null
        if (this.pendingUpdate) void this.update(this.pendingForce)
      })
    }
    return this.submission
  }

  private async submit(epoch: number) {
    while (this.pendingUpdate && epoch === this.epoch) {
      this.pendingUpdate = false
      const force = this.pendingForce
      this.pendingForce = false
      try {
        const state = await this.api.update(this.projectId, force)
        if (epoch === this.epoch) this.apply(state)
      } catch (error) {
        if (epoch === this.epoch && !this.pendingUpdate) this.onError(error)
      }
    }
  }

  private apply(state: RemotePreviewState) {
    clearTimeout(this.timer)
    this.onState(state)
    if (state.active || state.pending) {
      const epoch = this.epoch
      this.timer = setTimeout(() => void this.poll(epoch), this.pollInterval)
    }
  }

  private async poll(epoch: number) {
    if (epoch !== this.epoch || this.submission) return
    const version = this.version
    try {
      const state = await this.api.get(this.projectId)
      if (epoch === this.epoch && version === this.version && !this.submission) this.apply(state)
    } catch (error) {
      if (epoch === this.epoch && version === this.version) this.onError(error)
    }
  }
}
