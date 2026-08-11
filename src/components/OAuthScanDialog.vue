<script setup lang="ts">
import { CircleCheck, Loading, Refresh, Warning } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createOAuthSession, resolveOAuthEventsUrl, type OAuthFlowMode, type OAuthLoginResult, type OAuthProvider, type OAuthSseMessage, type OAuthStatus } from '@/http/oauth'
import OAuthProviderIcon from './OAuthProviderIcon.vue'

defineOptions({ name: 'OAuthScanDialog' })

interface Props {
  modelValue: boolean
  provider: OAuthProvider
  mode?: OAuthFlowMode
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'login',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: [result: OAuthLoginResult]
}>()

const status = ref<OAuthStatus>('loading')
const statusMessage = ref('正在创建安全连接...')
const qrCodeUrl = ref('')
const remainingSeconds = ref(180)
let eventSource: EventSource | null = null
let countdownTimer: number | null = null
let startSequence = 0

const providerName = computed(() => (props.provider === 'qq' ? 'QQ' : '微信'))
const dialogTitle = computed(() => `${props.mode === 'bind' ? '绑定' : '使用'}${providerName.value}`)
const isTerminal = computed(() => ['error', 'expired'].includes(status.value))
const statusIcon = computed(() => {
  if (status.value === 'success') return CircleCheck
  if (status.value === 'error' || status.value === 'expired') return Warning
  return Loading
})
const countdownText = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
  const seconds = remainingSeconds.value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
})

function stopSession() {
  startSequence += 1
  eventSource?.close()
  eventSource = null
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function startCountdown(expiresAt: string) {
  const update = () => {
    remainingSeconds.value = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
  }
  update()
  countdownTimer = window.setInterval(update, 1000)
}

function handleSseMessage(message: OAuthSseMessage) {
  statusMessage.value = message.data.message

  switch (message.event) {
    case 'waiting_scan':
      status.value = 'waiting'
      break
    case 'scan_complete':
      status.value = 'processing'
      break
    case 'login_success':
      status.value = 'success'
      eventSource?.close()
      eventSource = null
      if (message.data.result) emit('success', message.data.result)
      break
    case 'login_error':
      status.value = 'error'
      eventSource?.close()
      eventSource = null
      break
    case 'auth_expired':
      status.value = 'expired'
      eventSource?.close()
      eventSource = null
      break
  }
}

async function startSession() {
  stopSession()
  const sequence = startSequence
  status.value = 'loading'
  statusMessage.value = '正在创建安全连接...'
  qrCodeUrl.value = ''
  remainingSeconds.value = 180

  try {
    const session = await createOAuthSession(props.provider, props.mode)
    if (sequence !== startSequence || !props.modelValue) return

    qrCodeUrl.value = await QRCode.toDataURL(session.authorizeUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111318', light: '#ffffff' },
    })
    if (sequence !== startSequence || !props.modelValue) return

    status.value = 'waiting'
    statusMessage.value = '等待扫码...'
    startCountdown(session.expiresAt)

    const source = new EventSource(resolveOAuthEventsUrl(session.eventsUrl))
    eventSource = source
    source.onmessage = (event) => {
      try {
        handleSseMessage(JSON.parse(event.data) as OAuthSseMessage)
      } catch {
        status.value = 'error'
        statusMessage.value = '授权状态解析失败，请重新获取二维码'
        source.close()
      }
    }
    source.onerror = () => {
      if (!eventSource || isTerminal.value || status.value === 'success') return
      status.value = 'reconnecting'
      statusMessage.value = '连接中断，正在恢复...'
    }
  } catch (error) {
    if (sequence !== startSequence) return
    status.value = 'error'
    statusMessage.value = error instanceof Error ? error.message : '获取授权二维码失败'
  }
}

function handleClose() {
  stopSession()
  emit('update:modelValue', false)
}

watch(
  () => [props.modelValue, props.provider, props.mode] as const,
  ([visible]) => {
    if (visible) void startSession()
    else stopSession()
  },
  { immediate: true },
)

onBeforeUnmount(stopSession)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    class="oauth-dialog"
    width="26rem"
    align-center
    append-to-body
    :lock-scroll="false"
    destroy-on-close
    :show-close="true"
    @close="handleClose"
  >
    <template #header>
      <div class="oauth-dialog-header">
        <OAuthProviderIcon :provider="provider" :beta="provider === 'wechat'" />
        <div>
          <h2>{{ dialogTitle }}</h2>
          <p>{{ mode === 'bind' ? '扫码后将关联到当前账号' : '扫码授权后自动进入工作台' }}</p>
        </div>
      </div>
    </template>

    <div class="oauth-stage" :class="`oauth-stage--${status}`">
      <div class="oauth-qr-shell">
        <img v-if="qrCodeUrl" class="oauth-qr" :class="{ 'oauth-qr--muted': status === 'processing' || isTerminal }" :src="qrCodeUrl" :alt="`${providerName}授权二维码`" />
        <div v-else class="oauth-qr-placeholder">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
        <div v-if="status === 'processing' || status === 'success'" class="oauth-qr-overlay">
          <el-icon :class="{ 'is-loading': status === 'processing' }"><component :is="statusIcon" /></el-icon>
        </div>
      </div>

      <div class="oauth-status" aria-live="polite">
        <span class="oauth-status-dot" />
        <span>{{ statusMessage }}</span>
      </div>
      <p v-if="!isTerminal && status !== 'success'" class="oauth-expiry">二维码将在 {{ countdownText }} 后失效</p>

      <el-button v-if="isTerminal" class="oauth-retry" :icon="Refresh" @click="startSession">重新获取二维码</el-button>
    </div>

    <p class="oauth-security">二维码仅包含平台授权地址，登录凭证会通过加密连接返回此设备。</p>
  </el-dialog>
</template>

<style>
.oauth-dialog {
  max-width: calc(100vw - 2rem);
  border-radius: 0.5rem;
  overflow: hidden;
}

.oauth-dialog .el-dialog__header {
  margin: 0;
  padding: 1.25rem 1.4rem;
  border-bottom: 1px solid var(--app-border);
}

.oauth-dialog .el-dialog__body {
  padding: 1.5rem 1.4rem 1.25rem;
}

@media (max-width: 600px) {
  .oauth-dialog {
    width: calc(100vw - 32px) !important;
  }

  .oauth-dialog .el-dialog__header {
    padding: 18px 20px;
  }

  .oauth-dialog .el-dialog__body {
    padding: 22px 20px 18px;
  }
}
</style>

<style scoped>
.oauth-dialog-header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.oauth-dialog-header h2 {
  margin: 0;
  color: var(--app-text-primary);
  font-size: 1rem;
  line-height: 1.3;
}

.oauth-dialog-header p {
  margin: 0.2rem 0 0;
  color: var(--app-text-secondary);
  font-size: 0.75rem;
}

.oauth-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.oauth-qr-shell {
  position: relative;
  width: min(17rem, 72vw);
  aspect-ratio: 1;
  padding: 0.65rem;
  border: 1px solid var(--app-border-strong);
  background: #fff;
  box-shadow: 0 1rem 2.5rem rgba(17, 19, 24, 0.1);
}

.oauth-qr,
.oauth-qr-placeholder {
  display: block;
  width: 100%;
  height: 100%;
}

.oauth-qr-placeholder {
  display: grid;
  place-items: center;
  background: #f3f5f8;
  color: #17191d;
  font-size: 2rem;
}

.oauth-qr--muted {
  opacity: 0.18;
}

.oauth-qr-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #17191d;
  font-size: 2.5rem;
}

.oauth-stage--success .oauth-qr-overlay {
  color: #07a653;
}

.oauth-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.1rem;
  color: var(--app-text-primary);
  font-size: 0.875rem;
}

.oauth-status-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #2673ff;
  box-shadow: 0 0 0 0.3rem rgba(38, 115, 255, 0.12);
  animation: breathing 2.5s ease-in-out infinite;
}

@keyframes breathing {
  0% {
    transform: scale(0.9);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.8;
  }
}

.oauth-stage--error .oauth-status-dot,
.oauth-stage--expired .oauth-status-dot {
  background: #e24834;
  box-shadow: 0 0 0 0.3rem rgba(226, 72, 52, 0.12);
}

.oauth-stage--success .oauth-status-dot {
  background: #07a653;
  box-shadow: 0 0 0 0.3rem rgba(7, 166, 83, 0.12);
}

.oauth-expiry,
.oauth-security {
  color: var(--app-text-muted);
  font-size: 0.72rem;
  text-align: center;
}

.oauth-expiry {
  margin: 0.45rem 0 0;
}

.oauth-security {
  margin: 1.2rem 0 0;
  line-height: 1.6;
}

.oauth-retry {
  margin-top: 1rem;
}

@media (max-width: 600px) {
  .oauth-dialog-header {
    gap: 14px;
  }

  .oauth-dialog-header :deep(.provider-icon) {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
  }

  .oauth-dialog-header h2 {
    font-size: 16px;
  }

  .oauth-dialog-header p {
    margin-top: 3px;
    font-size: 12px;
  }

  .oauth-qr-shell {
    width: min(272px, 72vw);
    padding: 10px;
  }

  .oauth-status {
    gap: 8px;
    margin-top: 18px;
    font-size: 14px;
  }

  .oauth-status-dot {
    width: 7px;
    height: 7px;
  }

  .oauth-expiry,
  .oauth-security {
    font-size: 11px;
  }

  .oauth-expiry {
    margin-top: 7px;
  }

  .oauth-security {
    margin-top: 18px;
  }

  .oauth-retry {
    margin-top: 16px;
  }
}
</style>
