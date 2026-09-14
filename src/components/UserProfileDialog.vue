<script setup lang="ts">
import { Camera, Check, Lock, User } from '@element-plus/icons-vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { uploadImageToCos } from '@/http/cos'
import { getUserInfo, updateUserProfile, type UpdateUserProfileRequest, type UpdateUserProfileResponse, type UserInfoResponse } from '@/http/user'
import OAuthProviderIcon from './OAuthProviderIcon.vue'
import UserAvatar from './UserAvatar.vue'

defineOptions({ name: 'UserProfileDialog' })

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [profile: UpdateUserProfileResponse]
}>()

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const formRef = ref<FormInstance>()
const fileInputRef = ref<HTMLInputElement>()
const loading = ref(false)
const saving = ref(false)
const profile = ref<UserInfoResponse | null>(null)
const avatarFile = ref<File | null>(null)
const avatarPreviewUrl = ref('')
const unbind = reactive({ qq: false, wechat: false })
const form = reactive({
  nickname: '',
  account: '',
  currentPassword: '',
  password: '',
  confirmPassword: '',
})

const displayedName = computed(() => form.nickname.trim() || profile.value?.nickname || '未设置昵称')
const hasPendingAvatar = computed(() => !!avatarFile.value)

const rules: FormRules = {
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { min: 1, max: 20, message: '昵称长度为 1-20 个字符', trigger: 'blur' },
  ],
  account: [
    { required: true, message: '请输入登录账号', trigger: 'blur' },
    { min: 1, max: 50, message: '账号长度为 1-50 个字符', trigger: 'blur' },
  ],
  currentPassword: [
    {
      validator: (_rule, value: string, callback) => {
        if (form.password && !value) {
          callback(new Error('请输入原密码'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  password: [
    {
      validator: (_rule, value: string, callback) => {
        if (!value) {
          callback()
          return
        }
        if (!value.trim() || Array.from(value).length < 6) {
          callback(new Error('新密码至少需要 6 个字符'))
          return
        }
        if (new TextEncoder().encode(value).length > 72) {
          callback(new Error('新密码不能超过 72 个 UTF-8 字节'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    {
      validator: (_rule, value: string, callback) => {
        if (!form.password && !value) {
          callback()
          return
        }
        if (!form.password) {
          callback(new Error('请先输入新密码'))
          return
        }
        if (!value) {
          callback(new Error('请再次输入新密码'))
          return
        }
        if (value !== form.password) {
          callback(new Error('两次输入的新密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

function releaseAvatarPreview() {
  if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value)
  avatarPreviewUrl.value = ''
}

function resetEditor(nextProfile: UserInfoResponse) {
  releaseAvatarPreview()
  profile.value = nextProfile
  form.nickname = nextProfile.nickname
  form.account = nextProfile.account
  form.currentPassword = ''
  form.password = ''
  form.confirmPassword = ''
  avatarFile.value = null
  unbind.qq = false
  unbind.wechat = false
  formRef.value?.clearValidate()
}

async function loadProfile() {
  loading.value = true
  try {
    resetEditor(await getUserInfo())
  } catch {
    emit('update:modelValue', false)
  } finally {
    loading.value = false
  }
}

function openAvatarPicker() {
  if (!saving.value) fileInputRef.value?.click()
}

function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    ElMessage.warning('头像仅支持 JPG、PNG 或 WebP 格式')
    return
  }
  if (file.size > MAX_AVATAR_SIZE) {
    ElMessage.warning('头像大小不能超过 2MB')
    return
  }

  releaseAvatarPreview()
  avatarFile.value = file
  avatarPreviewUrl.value = URL.createObjectURL(file)
}

function cancelPendingAvatar() {
  releaseAvatarPreview()
  avatarFile.value = null
}

function handleNewPasswordInput() {
  if (form.confirmPassword) void formRef.value?.validateField('confirmPassword').catch(() => undefined)
}

function buildPayload(): UpdateUserProfileRequest {
  const current = profile.value
  if (!current) return {}

  const payload: UpdateUserProfileRequest = {}
  const nickname = form.nickname.trim()
  const account = form.account.trim()
  if (nickname !== current.nickname) payload.nickname = nickname
  if (account !== current.account) payload.account = account
  if (form.password) {
    payload.currentPassword = form.currentPassword
    payload.password = form.password
  }
  if (unbind.qq) payload.qq = false
  if (unbind.wechat) payload.wx = false
  return payload
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !profile.value) return

  saving.value = true
  const payload = buildPayload()

  if (avatarFile.value) {
    try {
      const uploadResult = await uploadImageToCos(avatarFile.value, profile.value.account)
      payload.avatar = uploadResult.url
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '头像上传失败')
      saving.value = false
      return
    }
  }

  if (Object.keys(payload).length === 0) {
    ElMessage.info('没有需要保存的变更')
    saving.value = false
    return
  }

  try {
    const updated = await updateUserProfile(payload)
    resetEditor(updated)
    emit('saved', updated)
    emit('update:modelValue', false)
    if (updated.ignoredFields.length > 0) {
      ElMessage.warning('部分内容未修改，请检查账号是否已被使用')
    } else {
      ElMessage.success('个人资料已保存')
    }
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    saving.value = false
  }
}

function handleClose() {
  if (saving.value) return
  releaseAvatarPreview()
  avatarFile.value = null
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) void loadProfile()
    else releaseAvatarPreview()
  },
)

onBeforeUnmount(releaseAvatarPreview)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    class="profile-dialog"
    width="752px"
    align-center
    append-to-body
    :lock-scroll="false"
    destroy-on-close
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    @close="handleClose"
  >
    <template #header>
      <div class="profile-dialog-heading">
        <span>Account / Profile</span>
        <h2>编辑个人资料</h2>
        <p>保存后，新的资料会同步到当前工作台。</p>
      </div>
    </template>

    <div v-loading="loading" class="profile-editor">
      <aside class="profile-identity">
        <div class="profile-avatar-frame" :class="{ 'profile-avatar-frame--pending': hasPendingAvatar }">
          <img v-if="avatarPreviewUrl" :src="avatarPreviewUrl" alt="待保存头像" />
          <UserAvatar v-else :avatar="profile?.avatar" :alt="displayedName" />
          <span v-if="hasPendingAvatar" class="profile-avatar-state">待保存</span>
        </div>

        <strong>{{ displayedName }}</strong>
        <span class="profile-identity-id">ID / {{ profile?.id ?? '--' }}</span>

        <input ref="fileInputRef" class="profile-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" @change="handleAvatarChange" />
        <button type="button" class="profile-avatar-button" :disabled="saving" @click="openAvatarPicker">
          <el-icon><Camera /></el-icon>
          <span>{{ hasPendingAvatar ? '重新选择' : '更换头像' }}</span>
        </button>
        <button v-if="hasPendingAvatar" type="button" class="profile-avatar-reset" :disabled="saving" @click="cancelPendingAvatar">取消更换</button>
        <small>JPG、PNG、WebP · 最大 2MB</small>
      </aside>

      <div class="profile-form-column">
        <div class="profile-section-heading">
          <el-icon><User /></el-icon>
          <div>
            <strong>基本资料</strong>
            <span>公开身份与登录账号</span>
          </div>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="profile-form" :disabled="loading || saving">
          <div class="profile-form-grid">
            <el-form-item label="昵称" prop="nickname">
              <el-input v-model="form.nickname" maxlength="20" show-word-limit autocomplete="nickname" />
            </el-form-item>
            <el-form-item label="登录账号" prop="account">
              <el-input v-model="form.account" maxlength="50" autocomplete="username" />
            </el-form-item>
          </div>

          <div class="profile-password-row">
            <div class="profile-password-label">
              <el-icon><Lock /></el-icon>
              <span>登录密码</span>
            </div>
            <div class="profile-password-fields">
              <el-form-item class="profile-password-current" label="原密码" prop="currentPassword">
                <el-input v-model="form.currentPassword" type="password" placeholder="请手动输入原密码" autocomplete="off" data-1p-ignore data-lpignore="true" />
              </el-form-item>
              <el-form-item label="新密码" prop="password">
                <el-input v-model="form.password" type="password" show-password placeholder="不修改请留空" autocomplete="new-password" @input="handleNewPasswordInput" />
              </el-form-item>
              <el-form-item label="确认新密码" prop="confirmPassword">
                <el-input v-model="form.confirmPassword" type="password" show-password placeholder="再次输入新密码" autocomplete="new-password" />
              </el-form-item>
            </div>
          </div>
        </el-form>

        <section class="profile-bindings" aria-labelledby="profile-bindings-title">
          <div class="profile-section-heading">
            <el-icon><Check /></el-icon>
            <div>
              <strong id="profile-bindings-title">关联账号</strong>
              <span>管理第三方登录方式</span>
            </div>
          </div>

          <div class="profile-binding-row">
            <OAuthProviderIcon provider="qq" />
            <div class="profile-binding-copy">
              <strong>QQ</strong>
              <span>{{ profile?.bindings?.qq ? '已绑定' : '未绑定' }}</span>
            </div>
            <el-checkbox v-if="profile?.bindings?.qq" v-model="unbind.qq" label="保存时解绑" />
            <span v-else class="profile-binding-empty">可在用户菜单中绑定</span>
          </div>

          <div class="profile-binding-row">
            <OAuthProviderIcon provider="wechat" beta />
            <div class="profile-binding-copy">
              <strong>微信</strong>
              <span>{{ profile?.bindings?.wechat ? '已绑定' : '未绑定' }}</span>
            </div>
            <el-checkbox v-if="profile?.bindings?.wechat" v-model="unbind.wechat" label="保存时解绑" />
            <span v-else class="profile-binding-empty">可在用户菜单中绑定</span>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <div class="profile-dialog-footer">
        <button type="button" class="profile-dialog-cancel" :disabled="saving" @click="handleClose">取消</button>
        <button type="button" class="profile-dialog-save" :disabled="loading || saving" @click="handleSave">
          <span v-if="saving" class="profile-save-spinner" aria-hidden="true" />
          <el-icon v-else><Check /></el-icon>
          <span>{{ saving ? '正在保存' : '保存修改' }}</span>
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<style>
.profile-dialog {
  display: flex;
  max-height: calc(100vh - 32px);
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--brand-radius-md);
  background: var(--app-surface);
  box-shadow: var(--brand-shadow-float);
  font-size: 16px;
  flex-direction: column;
}

.profile-dialog .el-dialog__header {
  margin: 0;
  padding: 20px 24px 18px;
  border-bottom: 1px solid var(--app-border);
}

.profile-dialog .el-dialog__body {
  min-height: 0;
  padding: 0;
  overflow-y: auto;
}

.profile-dialog .el-dialog__footer {
  padding: 14px 24px;
  border-top: 1px solid var(--app-border);
  background: var(--app-bg-muted);
}

@media (max-width: 720px) {
  .profile-dialog {
    max-height: calc(100vh - 24px);
    width: calc(100vw - 24px) !important;
    margin: 12px auto;
  }
}
</style>

<style scoped>
.profile-dialog-heading > span {
  display: none;
}

.profile-dialog-heading h2 {
  margin: 4px 0 0;
  color: var(--app-text-primary);
  font-size: 20px;
  line-height: 1.25;
}

.profile-dialog-heading p {
  margin: 5px 0 0;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.profile-editor {
  display: grid;
  min-height: 480px;
  grid-template-columns: 224px minmax(0, 1fr);
}

.profile-identity {
  display: flex;
  align-items: center;
  padding: 32px 24px;
  border-right: 1px solid var(--app-border);
  background: var(--app-bg-muted);
  flex-direction: column;
}

.profile-avatar-frame {
  position: relative;
  width: 112px;
  height: 112px;
  margin-bottom: 16px;
  padding: 6px;
  border: 1px solid var(--app-border-strong);
  border-radius: 6px;
  background: var(--app-surface);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--app-accent) 12%, transparent);
}

.profile-avatar-frame--pending {
  border-color: var(--app-accent);
}

.profile-avatar-frame img,
.profile-avatar-frame :deep(.user-avatar-image) {
  width: 100%;
  height: 100%;
  border-radius: 3px;
  object-fit: cover;
}

.profile-avatar-state {
  position: absolute;
  right: -7px;
  bottom: -7px;
  padding: 3px 6px;
  border: 1px solid var(--app-accent);
  border-radius: 3px;
  background: var(--app-surface);
  color: var(--app-accent);
  font-size: 10px;
  font-weight: 700;
}

.profile-identity > strong {
  max-width: 100%;
  overflow: hidden;
  color: var(--app-text-primary);
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-identity-id {
  margin-top: 4px;
  color: var(--app-text-muted);
  font-family: Consolas, 'SFMono-Regular', monospace;
  font-size: 11px;
}

.profile-avatar-input {
  display: none;
}

.profile-avatar-button,
.profile-avatar-reset,
.profile-dialog-cancel,
.profile-dialog-save {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
}

.profile-avatar-button {
  width: 100%;
  height: 36px;
  gap: 6px;
  margin-top: 22px;
  border: 1px solid var(--app-border-strong);
  background: var(--app-surface);
  color: var(--app-text-primary);
  font-size: 13px;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.profile-avatar-button:hover:not(:disabled) {
  border-color: var(--app-accent);
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.profile-avatar-reset {
  margin-top: 9px;
  border: 0;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 12px;
}

.profile-identity small {
  margin-top: 12px;
  color: var(--app-text-muted);
  font-size: 10px;
}

.profile-form-column {
  min-width: 0;
  padding: 26px 28px;
}

.profile-section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.profile-section-heading > .el-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-bg-muted);
  color: var(--app-accent);
}

.profile-section-heading div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.profile-section-heading strong {
  color: var(--app-text-primary);
  font-size: 13px;
}

.profile-section-heading span {
  margin-top: 1px;
  color: var(--app-text-muted);
  font-size: 11px;
}

.profile-form {
  margin-top: 18px;
}

.profile-form-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-form :deep(.el-form-item__label) {
  height: auto;
  padding-bottom: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.2;
}

.profile-form :deep(.el-input__wrapper) {
  min-height: 38px;
  border: 1px solid var(--app-border-strong);
  border-radius: 5px;
  background: var(--app-surface);
  box-shadow: none;
}

.profile-form :deep(.el-input__wrapper.is-focus) {
  border-color: var(--app-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 12%, transparent);
}

.profile-password-row {
  margin-top: 5px;
  padding: 20px 0 4px;
  border-top: 1px solid var(--app-border);
}

.profile-password-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.profile-password-fields {
  display: grid;
  gap: 18px 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-password-current {
  grid-column: 1 / -1;
}

.profile-password-fields :deep(.el-form-item) {
  margin-bottom: 0;
}

.profile-bindings {
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--app-border);
}

.profile-binding-row {
  display: flex;
  align-items: center;
  min-height: 52px;
  gap: 12px;
  border-bottom: 1px solid var(--app-border);
}

.profile-binding-row:last-child {
  border-bottom: 0;
}

.profile-binding-row :deep(.provider-icon) {
  width: 30px;
  height: 30px;
  flex-basis: 30px;
}

.profile-binding-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.profile-binding-copy strong {
  color: var(--app-text-primary);
  font-size: 12px;
}

.profile-binding-copy span,
.profile-binding-empty {
  color: var(--app-text-muted);
  font-size: 11px;
}

.profile-binding-row :deep(.el-checkbox__label) {
  color: var(--app-text-secondary);
  font-size: 11px;
}

.profile-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.profile-dialog-cancel,
.profile-dialog-save {
  min-width: 104px;
  height: 38px;
  gap: 6px;
  padding: 0 16px;
  border: 1px solid var(--app-border-strong);
  font-size: 12px;
  font-weight: 650;
}

.profile-dialog-cancel {
  background: var(--app-surface);
  color: var(--app-text-secondary);
}

.profile-dialog-save {
  border-color: var(--app-accent);
  background: var(--app-accent);
  color: #fff;
}

.profile-dialog-save:hover:not(:disabled) {
  filter: brightness(1.06);
}

.profile-dialog-save:disabled,
.profile-dialog-cancel:disabled,
.profile-avatar-button:disabled,
.profile-avatar-reset:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.profile-save-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: profile-save-spin 0.75s linear infinite;
}

@keyframes profile-save-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .profile-editor {
    min-height: 0;
    grid-template-columns: 1fr;
  }

  .profile-identity {
    display: grid;
    align-items: center;
    padding: 20px;
    border-right: 0;
    border-bottom: 1px solid var(--app-border);
    gap: 4px 16px;
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .profile-avatar-frame {
    width: 72px;
    height: 72px;
    margin: 0;
    grid-row: 1 / span 4;
  }

  .profile-avatar-button {
    width: max-content;
    height: 32px;
    margin-top: 6px;
    padding: 0 11px;
  }

  .profile-avatar-reset,
  .profile-identity small {
    display: none;
  }

  .profile-form-column {
    padding: 20px;
  }

  .profile-form-grid {
    grid-template-columns: 1fr;
  }

  .profile-password-fields {
    grid-template-columns: 1fr;
  }

  .profile-password-current {
    grid-column: auto;
  }

  .profile-password-label {
    padding-top: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-save-spinner {
    animation-duration: 1.5s;
  }
}
</style>
