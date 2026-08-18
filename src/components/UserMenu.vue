<script setup lang="ts">
import { ArrowDown, EditPen, Setting, SwitchButton } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setTokens } from '@/ajax'
import { useLogout } from '@/composables/useLogout'
import { getUserInfo, type UpdateUserProfileResponse, type UserRole } from '@/http/user'
import type { OAuthLoginResult, OAuthProvider } from '@/http/oauth'
import OAuthProviderIcon from './OAuthProviderIcon.vue'
import OAuthScanDialog from './OAuthScanDialog.vue'
import UserAvatar from './UserAvatar.vue'
import UserProfileDialog from './UserProfileDialog.vue'

defineOptions({ name: 'UserMenu' })

interface Props {
  account?: string
  nickname?: string
  avatar?: string | null
  compact?: boolean
  showName?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  account: '',
  nickname: '',
  avatar: '',
  compact: false,
  showName: false,
})

const emit = defineEmits<{
  'profile-updated': [profile: UpdateUserProfileResponse]
}>()

const router = useRouter()
const { confirmLogout } = useLogout()
const oauthDialogVisible = ref(false)
const profileDialogVisible = ref(false)
const activeProvider = ref<OAuthProvider>('qq')
const profileLoading = ref(false)
const profileLoaded = ref(false)
const profileAvatar = ref('')
const profileNickname = ref('')
const profileAccount = ref('')
const profileRole = ref<UserRole>('normal')
const bindings = reactive({ qq: false, wechat: false })
const displayedAvatar = computed(() => (profileLoaded.value ? profileAvatar.value : props.avatar))
const displayedName = computed(() => {
  if (profileLoaded.value) {
    return (profileNickname.value ?? '').trim() || (profileAccount.value ?? '').trim()
  }
  return (props.nickname ?? '').trim() || (props.account ?? '').trim()
})
const shortenedDisplayName = computed(() => {
  const characters = Array.from(displayedName.value)
  return characters.length > 10 ? `${characters.slice(0, 10).join('')}…` : displayedName.value
})
const canAccessAdmin = computed(() => profileRole.value === 'super' || profileRole.value === 'admin')
const roleLabel = computed(() => {
  const labels: Record<UserRole, string> = {
    super: '超级管理员',
    admin: '管理员',
    normal: '普通用户',
    disabled: '已禁用',
  }
  return labels[profileRole.value]
})

async function refreshBindings() {
  if (profileLoading.value) return

  profileLoading.value = true
  try {
    const profile = await getUserInfo()
    profileAvatar.value = profile.avatar?.trim() ?? ''
    profileNickname.value = profile.nickname ?? ''
    profileAccount.value = profile.account ?? ''
    profileRole.value = profile.role
    bindings.qq = profile.bindings?.qq ?? false
    bindings.wechat = profile.bindings?.wechat ?? false
    profileLoaded.value = true
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    profileLoading.value = false
  }
}

function openBindDialog(provider: OAuthProvider) {
  activeProvider.value = provider
  oauthDialogVisible.value = true
}

function handleMenuCommand(command: string) {
  if (command === 'logout') {
    void confirmLogout()
    return
  }
  if (command === 'edit-profile') profileDialogVisible.value = true
  if (command === 'admin') void router.push('/admin')
  if (command === 'bind-qq') openBindDialog('qq')
  if (command === 'bind-wechat') openBindDialog('wechat')
}

async function handleBindSuccess(result: OAuthLoginResult) {
  setTokens(result.accessToken, result.refreshToken)
  oauthDialogVisible.value = false
  await refreshBindings()
  ElMessage.success(`${activeProvider.value === 'qq' ? 'QQ' : '微信'}绑定成功`)
}

function handleProfileSaved(profile: UpdateUserProfileResponse) {
  profileAvatar.value = profile.avatar?.trim() ?? ''
  profileNickname.value = profile.nickname ?? ''
  profileAccount.value = profile.account ?? ''
  profileRole.value = profile.role
  bindings.qq = profile.bindings?.qq ?? false
  bindings.wechat = profile.bindings?.wechat ?? false
  profileLoaded.value = true
  emit('profile-updated', profile)
}

function handleDropdownVisible(visible: boolean) {
  if (visible && profileLoaded.value) void refreshBindings()
}

onMounted(() => {
  void refreshBindings()
})
</script>

<template>
  <el-dropdown trigger="click" @command="handleMenuCommand" @visible-change="handleDropdownVisible">
    <button
      type="button"
      class="user-menu-trigger"
      :class="{
        'user-menu-trigger--compact': compact,
        'user-menu-trigger--show-name': showName,
      }"
      :aria-label="displayedName ? `${displayedName} 的用户菜单` : '用户菜单'"
      :title="displayedName || '用户菜单'"
    >
      <UserAvatar class="user-menu-avatar" :avatar="displayedAvatar" />
      <span v-if="displayedName" class="user-menu-name">{{ shortenedDisplayName }}</span>
      <el-icon v-if="!compact && showName" class="user-menu-arrow"><ArrowDown /></el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu class="user-account-menu">
        <li class="user-account-summary" role="presentation">
          <UserAvatar class="user-account-summary-avatar" :avatar="displayedAvatar" />
          <strong>{{ displayedName || '当前账号' }}</strong>
          <em class="user-role-badge" :class="`user-role-badge--${profileRole}`">{{ roleLabel }}</em>
        </li>
        <el-dropdown-item command="edit-profile" :disabled="profileLoading" class="user-profile-item">
          <span class="user-profile-item-icon"
            ><el-icon><EditPen /></el-icon
          ></span>
          <span class="user-bind-copy"><strong>编辑资料</strong></span>
        </el-dropdown-item>
        <el-dropdown-item v-if="profileLoaded && !bindings.qq" command="bind-qq" :disabled="profileLoading" class="user-bind-item">
          <OAuthProviderIcon provider="qq" />
          <span class="user-bind-copy"><strong>绑定 QQ</strong></span>
        </el-dropdown-item>
        <el-dropdown-item v-if="profileLoaded && !bindings.wechat" command="bind-wechat" :disabled="profileLoading" class="user-bind-item">
          <OAuthProviderIcon provider="wechat" beta />
          <span class="user-bind-copy"><strong>绑定微信</strong></span>
        </el-dropdown-item>
        <el-dropdown-item v-if="canAccessAdmin" command="admin" class="user-admin-item">
          <span class="user-admin-item-icon"
            ><el-icon><Setting /></el-icon
          ></span>
          <span class="user-bind-copy"><strong>管理控制台</strong></span>
        </el-dropdown-item>
        <el-dropdown-item command="logout" class="user-logout-item">
          <el-icon><SwitchButton /></el-icon>
          退出登录
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>

  <OAuthScanDialog v-model="oauthDialogVisible" :provider="activeProvider" mode="bind" @success="handleBindSuccess" />
  <UserProfileDialog v-model="profileDialogVisible" @saved="handleProfileSaved" />
</template>

<style scoped>
.user-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  gap: 0;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background-color: var(--app-surface);
  color: var(--app-text-primary);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.user-menu-trigger--compact {
  width: 100%;
  height: auto;
  min-height: 38px;
  flex: initial;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
}

.user-menu-trigger:hover {
  border-color: var(--app-accent);
  background-color: var(--app-accent-soft);
}

.user-menu-avatar {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background-color: var(--app-bg-muted);
  line-height: 0;
}

.user-menu-trigger--compact .user-menu-avatar {
  width: 1.25rem;
  height: 1.25rem;
}

.user-menu-trigger:not(.user-menu-trigger--compact):not(.user-menu-trigger--show-name) .user-menu-name,
.user-menu-trigger:not(.user-menu-trigger--compact):not(.user-menu-trigger--show-name) .user-menu-arrow {
  display: none;
}

.user-menu-trigger--show-name:not(.user-menu-trigger--compact) {
  width: auto;
  max-width: 9rem;
  flex-basis: auto;
  justify-content: flex-start;
  gap: 0.45rem;
  padding: 0 0.55rem 0 0.22rem;
}

.user-menu-name {
  max-width: 8rem;
  overflow: hidden;
  font-size: 0.875rem;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu-trigger--show-name .user-menu-name {
  max-width: 5.8rem;
  font-weight: 700;
}

.user-menu-trigger--compact .user-menu-name {
  max-width: none;
  flex: 1;
}

.user-menu-arrow {
  color: var(--app-text-muted);
  font-size: 0.75rem;
}

.user-bind-copy {
  display: inline-flex;
  min-width: 6.5rem;
  align-items: center;
  margin-left: 0.625rem;
  line-height: 1;
}

.user-profile-item-icon {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  flex: 0 0 1.5rem;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 0.3rem;
  background: var(--app-bg-muted);
  color: var(--app-accent);
}

.user-bind-copy strong {
  color: var(--app-text-primary);
  font-size: 0.78rem;
  font-weight: 600;
}
</style>

<style>
.user-account-menu {
  min-width: 12.25rem;
  padding: 0.25rem !important;
}

.user-account-menu .user-account-summary {
  display: grid;
  min-height: 2.4rem;
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.2rem 0.45rem 0.35rem;
  border-bottom: 1px solid var(--app-border);
  list-style: none;
}

.user-account-summary-avatar {
  width: 1.5rem;
  height: 1.5rem;
}

.user-account-summary strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-account-summary strong {
  color: var(--app-text-primary);
  font-size: 0.75rem;
}

.user-role-badge {
  display: inline-flex;
  min-height: 1.2rem;
  align-items: center;
  padding: 0 0.35rem;
  border: 1px solid var(--app-border);
  border-radius: 0.2rem;
  background: var(--app-bg-muted);
  color: var(--app-text-secondary);
  font-size: 0.625rem;
  font-style: normal;
  font-weight: 700;
  white-space: nowrap;
}

.user-role-badge--super {
  border-color: #315efb;
  background: #e9efff;
  color: #254bd8;
}

.user-role-badge--admin {
  border-color: #7c5cd6;
  background: #f0ebff;
  color: #6642c8;
}

.user-role-badge--normal {
  border-color: #26936d;
  background: #e9f7f1;
  color: #16795b;
}

.user-role-badge--disabled {
  border-color: #e06a5b;
  background: #fff0ed;
  color: #c54b3d;
}

.user-account-menu .user-bind-item {
  height: 2.25rem;
  padding: 0 0.5rem;
}

.user-account-menu .user-profile-item {
  height: 2.25rem;
  padding: 0 0.5rem;
}

.user-account-menu .user-admin-item {
  height: 2.25rem;
  padding: 0 0.5rem;
}

.user-account-menu .user-admin-item-icon {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  flex: 0 0 1.5rem;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 0.3rem;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.user-account-menu .user-admin-item-icon .el-icon {
  width: 1rem;
  height: 1rem;
  margin: 0;
  font-size: 1rem;
}

.user-account-menu .provider-icon {
  width: 1.25rem;
  height: 1.25rem;
  flex: 0 0 1.25rem;
  margin-inline: 0.125rem;
}

.user-account-menu .provider-icon img {
  width: 0.95rem;
  height: 0.95rem;
}

.user-account-menu .provider-icon--qq img {
  width: 1.1rem;
  height: 1.1rem;
}

.user-account-menu .provider-beta {
  top: -0.18rem;
  right: -0.3rem;
  min-width: 1rem;
  padding: 0.06rem 0.14rem;
}

.user-account-menu .user-logout-item {
  height: 2.1rem;
  margin-top: 0.2rem;
  background-color: #fff1f1;
  color: #c93636;
}

html.dark .user-role-badge--super {
  border-color: #5279e5;
  background: #1d2948;
  color: #88a7ff;
}

html.dark .user-role-badge--admin {
  border-color: #765fc0;
  background: #2c2445;
  color: #b69dff;
}

html.dark .user-role-badge--normal {
  border-color: #24775f;
  background: #17342e;
  color: #5bd1a8;
}

html.dark .user-role-badge--disabled {
  border-color: #81453f;
  background: #3a2220;
  color: #ff9285;
}

.user-account-menu .user-logout-item:not(.is-disabled):hover,
.user-account-menu .user-logout-item:not(.is-disabled):focus {
  background-color: #ffe2e2;
  color: #b42323;
}

html.dark .user-account-menu .user-logout-item {
  background-color: rgba(255, 92, 92, 0.12);
  color: #ff8e8e;
}

html.dark .user-account-menu .user-logout-item:not(.is-disabled):hover,
html.dark .user-account-menu .user-logout-item:not(.is-disabled):focus {
  background-color: rgba(255, 92, 92, 0.2);
  color: #ffaaaa;
}
</style>
