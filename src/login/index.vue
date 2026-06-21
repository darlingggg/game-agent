<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { setToken } from '@/ajax'
import { loginUser, registerUser } from '@/http/user'

defineOptions({
  name: 'AuthPage',
})

const router = useRouter()
const route = useRoute()

/** 是否为注册模式 */
const isRegisterMode = computed(() => route.path === '/register')

/** 表单实例 */
const formRef = ref<FormInstance>()

/** 表单数据 */
const form = reactive({
  account: '',
  password: '',
  confirmPassword: '',
  nickname: '',
})

/** 提交中 */
const loading = ref(false)

/** 确认密码校验 */
function validateConfirmPassword(_rule: unknown, value: string, callback: (error?: Error) => void) {
  if (!value) {
    callback(new Error('请再次输入密码'))
    return
  }
  if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
    return
  }
  callback()
}

/** 表单校验规则 */
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

/** 页面副标题 */
const pageSubtitle = computed(() =>
  isRegisterMode.value ? '创建账号，开始创作你的游戏' : '登录后开始创作你的游戏',
)

/** 提交按钮文案 */
const submitText = computed(() => (isRegisterMode.value ? '注册' : '登录'))

/** 切换模式文案 */
const switchText = computed(() => (isRegisterMode.value ? '已有账号？去登录' : '没有账号？去注册'))

/** 切换模式目标路由 */
const switchPath = computed(() => (isRegisterMode.value ? '/login' : '/register'))

/** 切换登录/注册时重置表单 */
watch(isRegisterMode, () => {
  form.account = ''
  form.password = ''
  form.confirmPassword = ''
  form.nickname = ''
  formRef.value?.clearValidate()
})

/**
 * 提交表单
 */
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const account = form.account.trim()
    const password = form.password

    const result = isRegisterMode.value
      ? await registerUser({
          account,
          password,
          nickname: form.nickname.trim(),
        })
      : await loginUser({ account, password })

    setToken(result.token)
    ElMessage.success(isRegisterMode.value ? '注册成功' : '登录成功')

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : isRegisterMode.value ? '注册失败' : '登录失败',
    )
  } finally {
    loading.value = false
  }
}

/**
 * 切换登录/注册
 */
function handleSwitchMode() {
  router.push({
    path: switchPath.value,
    query: route.query.redirect ? { redirect: route.query.redirect } : undefined,
  })
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">GameAgent</h1>
      <p class="auth-subtitle">{{ pageSubtitle }}</p>

      <el-form
        ref="formRef"
        class="auth-form"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="账号" prop="account">
          <el-input v-model="form.account" placeholder="请输入账号" autocomplete="username" />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            show-password
            :autocomplete="isRegisterMode ? 'new-password' : 'current-password'"
          />
        </el-form-item>

        <el-form-item v-if="isRegisterMode" label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="请再次输入密码"
            show-password
            autocomplete="new-password"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-form-item v-if="isRegisterMode" label="昵称（选填）" prop="nickname">
          <el-input v-model="form.nickname" placeholder="请输入昵称" autocomplete="nickname" />
        </el-form-item>

        <el-button class="auth-btn" type="primary" :loading="loading" @click="handleSubmit">
          {{ submitText }}
        </el-button>
      </el-form>

      <button type="button" class="auth-switch" @click="handleSwitchMode">
        {{ switchText }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--app-bg-gradient-start) 0%, var(--app-bg-gradient-end) 100%);
}

.auth-card {
  width: 100%;
  max-width: 24rem;
  padding: 2.5rem 2rem;
  background-color: var(--app-surface);
  border-radius: 0.75rem;
  box-shadow: 0 8px 24px var(--app-shadow);
  border: 1px solid var(--app-border);
}

.auth-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--app-text-primary);
  text-align: center;
}

.auth-subtitle {
  margin: 0.5rem 0 2rem;
  font-size: 0.875rem;
  color: var(--app-text-secondary);
  text-align: center;
}

.auth-form {
  width: 100%;
}

.auth-btn {
  width: 100%;
  margin-top: 0.5rem;
}

.auth-switch {
  display: block;
  width: 100%;
  margin-top: 1rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--app-accent);
  font-size: 0.875rem;
  cursor: pointer;
  text-align: center;
}

.auth-switch:hover {
  text-decoration: underline;
}
</style>
