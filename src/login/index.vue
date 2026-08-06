<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { setTokens } from '@/ajax'
import OAuthProviderIcon from '@/components/OAuthProviderIcon.vue'
import OAuthScanDialog from '@/components/OAuthScanDialog.vue'
import type { OAuthLoginResult, OAuthProvider } from '@/http/oauth'
import { loginUser, registerUser } from '@/http/user'

defineOptions({ name: 'AuthPage' })

const router = useRouter()
const route = useRoute()
const isRegisterMode = computed(() => route.path === '/register')
const formRef = ref<FormInstance>()
const loading = ref(false)
const oauthDialogVisible = ref(false)
const activeProvider = ref<OAuthProvider>('qq')

const form = reactive({
  account: '',
  password: '',
  confirmPassword: '',
  nickname: '',
})

function validateConfirmPassword(_rule: unknown, value: string, callback: (error?: Error) => void) {
  if (!value) return callback(new Error('请再次输入密码'))
  if (value !== form.password) return callback(new Error('两次输入的密码不一致'))
  callback()
}

const rules = computed<FormRules>(() => {
  const baseRules: FormRules = {
    account: [{ required: true, message: '请输入账号', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  }
  if (isRegisterMode.value) {
    baseRules.confirmPassword = [
      { required: true, message: '请再次输入密码', trigger: 'blur' },
      { validator: validateConfirmPassword, trigger: 'blur' },
    ]
  }
  return baseRules
})

const pageTitle = computed(() => (isRegisterMode.value ? '创建你的创作空间' : '欢迎回来'))
const pageSubtitle = computed(() => (isRegisterMode.value ? '注册账号，保存并继续你的项目' : '登录后继续构建你的应用'))
const submitText = computed(() => (isRegisterMode.value ? '创建账号' : '进入工作台'))
const switchText = computed(() => (isRegisterMode.value ? '已有账号？直接登录' : '还没有账号？创建一个'))
const switchPath = computed(() => (isRegisterMode.value ? '/login' : '/register'))

watch(isRegisterMode, async () => {
  Object.assign(form, { account: '', password: '', confirmPassword: '', nickname: '' })
  await nextTick()
  formRef.value?.clearValidate()
})

function getRedirectPath() {
  return typeof route.query.redirect === 'string' ? route.query.redirect : '/'
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const result = isRegisterMode.value
      ? await registerUser({ account: form.account.trim(), password: form.password, nickname: form.nickname.trim() })
      : await loginUser({ account: form.account.trim(), password: form.password })

    setTokens(result.accessToken, result.refreshToken)
    ElMessage.success(isRegisterMode.value ? '注册成功' : '登录成功')
    await router.replace(getRedirectPath())
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    loading.value = false
  }
}

function handleSwitchMode() {
  void router.push({
    path: switchPath.value,
    query: route.query.redirect ? { redirect: route.query.redirect } : undefined,
  })
}

function openOAuth(provider: OAuthProvider) {
  activeProvider.value = provider
  oauthDialogVisible.value = true
}

async function handleOAuthSuccess(result: OAuthLoginResult) {
  setTokens(result.accessToken, result.refreshToken)
  oauthDialogVisible.value = false
  ElMessage.success(`${activeProvider.value === 'qq' ? 'QQ' : '微信'}登录成功`)
  await router.replace(getRedirectPath())
}

onBeforeUnmount(() => {
  oauthDialogVisible.value = false
})
</script>

<template>
  <main class="auth-page">
    <section class="auth-visual" aria-label="AI Agent">
      <div class="auth-grid" aria-hidden="true" />
      <header class="auth-brand">
        <span class="auth-brand-mark">
          <svg viewBox="0 0 1024 1024" aria-hidden="true">
            <path d="M128 448a96 96 0 0 1 28.032 187.84v63.232l.256 4.288a32 32 0 0 0 15.68 23.424l324.032 187.072 3.84 1.856a32.128 32.128 0 0 0 28.16-1.92l323.968-187.008 3.52-2.368a32 32 0 0 0 12.416-25.344v-11.072a32 32 0 0 1 64 0v11.072a96 96 0 0 1-37.376 76.096l-10.56 7.04-323.968 187.072a96.128 96.128 0 0 1-84.544 5.632l-11.456-5.632-324.032-187.072a96 96 0 0 1-47.104-70.4l-.896-12.736V632.96A96 96 0 0 1 128 448Zm338.56-96c22.08 0 41.792 14.144 48.96 35.2l84.352 248.448a27.52 27.52 0 1 1-52.288 17.216l-20.864-65.728H404.608l-21.76 66.432a26.752 26.752 0 1 1-50.752-16.96l85.376-249.6A51.84 51.84 0 0 1 466.56 352Zm209.92 0A27.52 27.52 0 0 1 704 379.584V644.48a27.584 27.584 0 0 1-55.104 0V379.52A27.52 27.52 0 0 1 676.416 352ZM128 512a32 32 0 1 0 0 64 32 32 0 0 0 0-64ZM475.456 49.152A96 96 0 0 1 560 54.784l323.968 187.072 10.56 7.04a96 96 0 0 1 37.44 76.096v65.92a96 96 0 1 1-64-2.752v-63.168a32 32 0 0 0-12.48-25.344l-3.584-2.368L528 110.208a32 32 0 0 0-28.16-1.92l-3.84 1.92-324.032 187.072a32 32 0 0 0-16 27.712v11.008a32 32 0 0 1-64 0v-11.008a96 96 0 0 1 48-83.2L464 54.848l11.456-5.632Zm-54.4 487.296h89.28l-41.728-130.496h-5.056l-42.496 130.56ZM896 448a32 32 0 1 0 0 64 32 32 0 0 0 0-64Z" />
          </svg>
        </span>
        <span>AI AGENT</span>
      </header>

      <div class="auth-orbit" aria-hidden="true">
        <span class="auth-orbit-ring auth-orbit-ring--outer" />
        <span class="auth-orbit-ring auth-orbit-ring--inner" />
        <span class="auth-orbit-core">
          <svg viewBox="0 0 1024 1024">
            <path d="M128 448a96 96 0 0 1 28.032 187.84v63.232l.256 4.288a32 32 0 0 0 15.68 23.424l324.032 187.072 3.84 1.856a32.128 32.128 0 0 0 28.16-1.92l323.968-187.008 3.52-2.368a32 32 0 0 0 12.416-25.344v-11.072a32 32 0 0 1 64 0v11.072a96 96 0 0 1-37.376 76.096l-10.56 7.04-323.968 187.072a96.128 96.128 0 0 1-84.544 5.632l-11.456-5.632-324.032-187.072a96 96 0 0 1-47.104-70.4l-.896-12.736V632.96A96 96 0 0 1 128 448Zm338.56-96c22.08 0 41.792 14.144 48.96 35.2l84.352 248.448a27.52 27.52 0 1 1-52.288 17.216l-20.864-65.728H404.608l-21.76 66.432a26.752 26.752 0 1 1-50.752-16.96l85.376-249.6A51.84 51.84 0 0 1 466.56 352Zm209.92 0A27.52 27.52 0 0 1 704 379.584V644.48a27.584 27.584 0 0 1-55.104 0V379.52A27.52 27.52 0 0 1 676.416 352ZM128 512a32 32 0 1 0 0 64 32 32 0 0 0 0-64ZM475.456 49.152A96 96 0 0 1 560 54.784l323.968 187.072 10.56 7.04a96 96 0 0 1 37.44 76.096v65.92a96 96 0 1 1-64-2.752v-63.168a32 32 0 0 0-12.48-25.344l-3.584-2.368L528 110.208a32 32 0 0 0-28.16-1.92l-3.84 1.92-324.032 187.072a32 32 0 0 0-16 27.712v11.008a32 32 0 0 1-64 0v-11.008a96 96 0 0 1 48-83.2L464 54.848l11.456-5.632Zm-54.4 487.296h89.28l-41.728-130.496h-5.056l-42.496 130.56ZM896 448a32 32 0 1 0 0 64 32 32 0 0 0 0-64Z" />
          </svg>
        </span>
        <span class="auth-orbit-node auth-orbit-node--one" />
        <span class="auth-orbit-node auth-orbit-node--two" />
      </div>

      <div class="auth-visual-copy">
        <span class="auth-kicker">BUILD / PLAY / ITERATE</span>
        <h1>把想法推向<br />可运行的世界</h1>
        <p>从第一句描述，到可以分享的作品。</p>
      </div>
      <span class="auth-visual-index">01 — CREATE</span>
    </section>

    <section class="auth-panel">
      <div class="auth-panel-inner">
        <div class="auth-panel-heading">
          <span class="auth-panel-eyebrow">ACCOUNT ACCESS</span>
          <h2>{{ pageTitle }}</h2>
          <p>{{ pageSubtitle }}</p>
        </div>

        <div class="oauth-options">
          <button type="button" class="oauth-option" @click="openOAuth('qq')">
            <OAuthProviderIcon provider="qq" beta />
            <span><strong>QQ</strong><small>扫码{{ isRegisterMode ? '注册或' : '' }}登录</small></span>
            <el-icon><ArrowRight /></el-icon>
          </button>
          <button type="button" class="oauth-option" @click="openOAuth('wechat')">
            <OAuthProviderIcon provider="wechat" beta />
            <span><strong>微信</strong><small>扫码{{ isRegisterMode ? '注册或' : '' }}登录</small></span>
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>

        <div class="auth-divider"><span>或使用账号</span></div>

        <el-form ref="formRef" class="auth-form" :model="form" :rules="rules" :validate-on-rule-change="false" label-position="top" @submit.prevent="handleSubmit">
          <el-form-item label="账号" prop="account">
            <el-input v-model="form.account" placeholder="输入账号" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" type="password" placeholder="输入密码" show-password :autocomplete="isRegisterMode ? 'new-password' : 'current-password'" @keyup.enter="!isRegisterMode && handleSubmit()" />
          </el-form-item>
          <el-form-item v-if="isRegisterMode" label="确认密码" prop="confirmPassword">
            <el-input v-model="form.confirmPassword" type="password" placeholder="再次输入密码" show-password autocomplete="new-password" />
          </el-form-item>
          <el-form-item v-if="isRegisterMode" label="昵称（选填）" prop="nickname">
            <el-input v-model="form.nickname" placeholder="你希望显示的名字" autocomplete="nickname" @keyup.enter="handleSubmit" />
          </el-form-item>

          <el-button class="auth-submit" type="primary" :loading="loading" @click="handleSubmit">
            {{ submitText }}
            <el-icon v-if="!loading"><ArrowRight /></el-icon>
          </el-button>
        </el-form>

        <button type="button" class="auth-switch" @click="handleSwitchMode">{{ switchText }}</button>
      </div>
      <p class="auth-legal">登录即表示你同意安全保存必要的账户凭证。</p>
    </section>

    <OAuthScanDialog v-model="oauthDialogVisible" :provider="activeProvider" mode="login" @success="handleOAuthSuccess" />
  </main>
</template>

<style scoped>
.auth-page {
  display: grid;
  width: 100%;
  min-height: 100vh;
  grid-template-columns: minmax(0, 1.25fr) minmax(27rem, 0.75fr);
  background: #f7f7f4;
}

.auth-visual {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: #131518;
  color: #f8f8f4;
}

.auth-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px);
  background-size: 4.5rem 4.5rem;
  mask-image: linear-gradient(to bottom, #000 42%, transparent 100%);
}

.auth-brand {
  position: absolute;
  top: 2rem;
  left: 2.25rem;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: Arial, sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.auth-brand-mark {
  display: grid;
  width: 2.2rem;
  height: 2.2rem;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.24);
}

.auth-brand-mark svg {
  width: 1.35rem;
  height: 1.35rem;
  fill: currentColor;
}

.auth-orbit {
  position: absolute;
  top: 43%;
  left: 60%;
  width: 31rem;
  max-width: 70%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
}

.auth-orbit-ring,
.auth-orbit-core,
.auth-orbit-node {
  position: absolute;
  border-radius: 50%;
}

.auth-orbit-ring {
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.auth-orbit-ring--outer {
  inset: 0;
  animation: orbit-spin 24s linear infinite;
}

.auth-orbit-ring--outer::after {
  position: absolute;
  top: 8%;
  left: 18%;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #ff5b45;
  content: '';
}

.auth-orbit-ring--inner {
  inset: 17%;
  border-color: rgba(63, 130, 255, 0.58);
}

.auth-orbit-core {
  inset: 32%;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: #2673ff;
  box-shadow: 0 2rem 5rem rgba(0, 0, 0, 0.35);
}

.auth-orbit-core svg {
  width: 46%;
  fill: #fff;
}

.auth-orbit-node {
  width: 0.7rem;
  height: 0.7rem;
  border: 2px solid #131518;
  background: #f8f8f4;
}

.auth-orbit-node--one {
  top: 49%;
  left: 16.6%;
}

.auth-orbit-node--two {
  right: 2%;
  bottom: 29%;
  background: #ff5b45;
}

.auth-visual-copy {
  position: absolute;
  bottom: 4.4rem;
  left: 2.25rem;
  z-index: 2;
}

.auth-kicker,
.auth-visual-index,
.auth-panel-eyebrow {
  font-family: Arial, sans-serif;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.auth-kicker {
  color: #71a0ff;
}

.auth-visual-copy h1 {
  margin: 0.85rem 0 0;
  font-family: 'Arial Narrow', 'Microsoft YaHei', sans-serif;
  font-size: 3.8rem;
  font-weight: 650;
  line-height: 1.08;
  letter-spacing: 0;
}

.auth-visual-copy p {
  margin: 1rem 0 0;
  color: rgba(248, 248, 244, 0.62);
  font-size: 0.86rem;
}

.auth-visual-index {
  position: absolute;
  right: 2.25rem;
  bottom: 2.1rem;
  color: rgba(248, 248, 244, 0.42);
}

.auth-panel {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  justify-content: center;
  padding: 2.4rem 3.6rem 1.5rem;
  background: #f7f7f4;
  color: #17191d;
}

.auth-panel-inner {
  width: 100%;
  max-width: 28rem;
  margin: auto;
}

.auth-panel-eyebrow {
  color: #2673ff;
}

.auth-panel-heading h2 {
  margin: 0.7rem 0 0;
  font-size: 2rem;
  font-weight: 680;
  line-height: 1.2;
  letter-spacing: 0;
}

.auth-panel-heading p {
  margin: 0.6rem 0 0;
  color: #74777d;
  font-size: 0.86rem;
}

.oauth-options {
  display: grid;
  gap: 0.65rem;
  margin-top: 1.65rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.oauth-option {
  display: grid;
  min-width: 0;
  height: 4.5rem;
  align-items: center;
  padding: 0 0.9rem;
  border: 1px solid #dfe1e4;
  border-radius: 0.4rem;
  background: #fff;
  color: #17191d;
  cursor: pointer;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.7rem;
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.oauth-option:hover {
  border-color: #9aa3af;
  box-shadow: 0 0.8rem 1.8rem rgba(17, 19, 24, 0.08);
  transform: translateY(-2px);
}

.oauth-option > span:not(.provider-icon) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.15rem;
}

.oauth-option strong {
  font-size: 0.86rem;
  font-weight: 650;
}

.oauth-option small {
  overflow: hidden;
  color: #85888e;
  font-size: 0.66rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oauth-option > .el-icon {
  color: #8d9198;
  font-size: 0.8rem;
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 1.5rem 0 1.25rem;
  color: #96999f;
  font-size: 0.68rem;
}

.auth-divider::before,
.auth-divider::after {
  height: 1px;
  flex: 1;
  background: #dfe1e4;
  content: '';
}

.auth-form :deep(.el-form-item) {
  margin-bottom: 1rem;
}

.auth-form :deep(.el-form-item__label) {
  height: auto;
  margin-bottom: 0.38rem;
  color: #3e4147;
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1.2;
}

.auth-form :deep(.el-input__wrapper) {
  min-height: 2.8rem;
  border-radius: 0.3rem;
  background: #fff;
  box-shadow: 0 0 0 1px #dfe1e4 inset;
}

.auth-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #2673ff inset, 0 0 0 3px rgba(38, 115, 255, 0.1);
}

.auth-submit {
  width: 100%;
  height: 3rem;
  margin-top: 0.2rem;
  border-radius: 0.3rem;
  background: #17191d;
  font-weight: 650;
}

.auth-submit:hover {
  background: #2673ff;
}

.auth-submit .el-icon {
  margin-left: 0.45rem;
}

.auth-switch {
  display: block;
  width: 100%;
  margin-top: 1rem;
  padding: 0.25rem;
  border: 0;
  background: transparent;
  color: #2673ff;
  cursor: pointer;
  font-size: 0.78rem;
  text-align: center;
}

.auth-switch:hover {
  text-decoration: underline;
}

.auth-legal {
  margin: 1.5rem auto 0;
  color: #9a9da2;
  font-size: 0.65rem;
  text-align: center;
}

@keyframes orbit-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 860px) {
  .auth-page {
    display: block;
    background: #f7f7f4;
  }

  .auth-visual {
    min-height: 17rem;
    height: 34vh;
  }

  .auth-brand {
    top: 18px;
    left: 18px;
    gap: 8px;
    font-size: 10px;
  }

  .auth-brand-mark {
    width: 32px;
    height: 32px;
  }

  .auth-brand-mark svg {
    width: 19px;
    height: 19px;
  }

  .auth-orbit {
    top: 38%;
    left: 75%;
    width: 220px;
  }

  .auth-visual-copy {
    bottom: 24px;
    left: 18px;
  }

  .auth-visual-copy h1 {
    margin-top: 8px;
    font-size: 30px;
  }

  .auth-kicker,
  .auth-panel-eyebrow {
    font-size: 10px;
  }

  .auth-visual-copy p,
  .auth-visual-index {
    display: none;
  }

  .auth-panel {
    min-height: 66vh;
    padding: 46px 24px 24px;
  }

  .auth-panel-heading h2 {
    margin-top: 8px;
    font-size: 28px;
  }

  .auth-panel-heading p {
    margin-top: 8px;
    font-size: 14px;
  }

  .oauth-options {
    gap: 10px;
    margin-top: 24px;
  }

  .oauth-option {
    height: 64px;
    padding: 0 14px;
    gap: 12px;
  }

  .oauth-option :deep(.provider-icon) {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
  }

  .oauth-option :deep(.provider-beta) {
    top: -5px;
    right: -8px;
    min-width: 28px;
    padding: 2px 4px;
    font-size: 7px;
  }

  .oauth-option strong {
    font-size: 14px;
  }

  .oauth-option small,
  .auth-divider {
    font-size: 11px;
  }

  .auth-divider {
    gap: 12px;
    margin: 22px 0 18px;
  }

  .auth-form :deep(.el-form-item) {
    margin-bottom: 16px;
  }

  .auth-form :deep(.el-form-item__label) {
    margin-bottom: 6px;
    font-size: 13px;
  }

  .auth-form :deep(.el-input__wrapper) {
    min-height: 44px;
  }

  .auth-form :deep(.el-input__inner) {
    font-size: 16px;
  }

  .auth-submit {
    height: 48px;
    margin-top: 4px;
    font-size: 14px;
  }

  .auth-switch {
    margin-top: 16px;
    padding: 4px;
    font-size: 13px;
  }

  .auth-legal {
    margin-top: 24px;
    font-size: 10px;
  }
}

@media (max-width: 460px) {
  .oauth-options {
    grid-template-columns: 1fr;
  }

  .auth-panel-heading h2 {
    font-size: 26px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-orbit-ring--outer {
    animation: none;
  }

  .oauth-option {
    transition: none;
  }
}
</style>
