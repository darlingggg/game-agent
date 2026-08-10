<script setup lang="ts">
import { ArrowDown, EditPen, SwitchButton } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { setTokens } from '@/ajax'
import { useLogout } from '@/composables/useLogout'
import { getUserInfo, type UpdateUserProfileResponse } from '@/http/user'
import type { OAuthLoginResult, OAuthProvider } from '@/http/oauth'
import OAuthProviderIcon from './OAuthProviderIcon.vue'
import OAuthScanDialog from './OAuthScanDialog.vue'
import UserAvatar from './UserAvatar.vue'
import UserProfileDialog from './UserProfileDialog.vue'

defineOptions({ name: 'UserMenu' })

interface Props {
  nickname?: string
  avatar?: string | null
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  nickname: '',
  avatar: '',
  compact: false,
})

const emit = defineEmits<{
  'profile-updated': [profile: UpdateUserProfileResponse]
}>()

const { confirmLogout } = useLogout()
const oauthDialogVisible = ref(false)
const profileDialogVisible = ref(false)
const activeProvider = ref<OAuthProvider>('qq')
const profileLoading = ref(false)
const profileLoaded = ref(false)
const profileAvatar = ref('')
const profileNickname = ref('')
const bindings = reactive({ qq: false, wechat: false })
const displayedAvatar = computed(() =>
  profileLoaded.value ? profileAvatar.value : props.avatar,
)
const displayedNickname = computed(() => profileNickname.value || props.nickname)
const hasAvailableBinding = computed(
  () => profileLoaded.value && (!bindings.qq || !bindings.wechat),
)

async function refreshBindings() {
  if (profileLoading.value) return

  profileLoading.value = true
  try {
    const profile = await getUserInfo()
    profileAvatar.value = profile.avatar?.trim() ?? ''
    profileNickname.value = profile.nickname
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
  profileNickname.value = profile.nickname
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
      :class="{ 'user-menu-trigger--compact': compact }"
      :aria-label="displayedNickname ? `${displayedNickname} 的用户菜单` : '用户菜单'"
      :title="displayedNickname || '用户菜单'"
    >
      <UserAvatar class="user-menu-avatar" :avatar="displayedAvatar" />
      <span v-if="displayedNickname" class="user-menu-name">{{ displayedNickname }}</span>
      <el-icon v-if="!compact" class="user-menu-arrow"><ArrowDown /></el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu
        class="user-account-menu"
        :class="{ 'user-account-menu--has-bindings': hasAvailableBinding }"
      >
        <el-dropdown-item command="edit-profile" :disabled="profileLoading" class="user-profile-item">
          <span class="user-profile-item-icon"
            ><el-icon><EditPen /></el-icon
          ></span>
          <span class="user-bind-copy"><strong>编辑个人资料</strong><small>头像、昵称与登录信息</small></span>
        </el-dropdown-item>
        <el-dropdown-item v-if="profileLoaded && !bindings.qq" command="bind-qq" :disabled="profileLoading" class="user-bind-item">
          <OAuthProviderIcon provider="qq" beta />
          <span class="user-bind-copy"><strong>绑定 QQ</strong><small>扫码关联当前账号</small></span>
        </el-dropdown-item>
        <el-dropdown-item v-if="profileLoaded && !bindings.wechat" command="bind-wechat" :disabled="profileLoading" class="user-bind-item">
          <OAuthProviderIcon provider="wechat" beta />
          <span class="user-bind-copy"><strong>绑定微信</strong><small>扫码关联当前账号</small></span>
        </el-dropdown-item>
        <el-dropdown-item :divided="hasAvailableBinding" command="logout" class="user-logout-item">
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

.user-menu-trigger:not(.user-menu-trigger--compact) .user-menu-name,
.user-menu-trigger:not(.user-menu-trigger--compact) .user-menu-arrow {
  display: none;
}

.user-menu-name {
  max-width: 8rem;
  overflow: hidden;
  font-size: 0.875rem;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  display: flex;
  min-width: 8.5rem;
  flex-direction: column;
  gap: 0.1rem;
  margin-left: 1rem;
  line-height: 1.2;
}

.user-profile-item-icon {
  display: grid;
  width: 1.9rem;
  height: 1.9rem;
  flex: 0 0 1.9rem;
  place-items: center;
  border: 1px solid var(--app-border);
  border-radius: 0.3rem;
  background: var(--app-bg-muted);
  color: var(--app-accent);
}

.user-bind-copy strong {
  color: var(--app-text-primary);
  font-size: 0.82rem;
  font-weight: 600;
}

.user-bind-copy small {
  color: var(--app-text-muted);
  font-size: 0.68rem;
}
</style>

<style>
.user-account-menu {
  min-width: 14rem;
  padding: 0.35rem !important;
}

.user-account-menu .user-bind-item {
  height: 3.5rem;
  padding: 0 0.8rem;
}

.user-account-menu .user-profile-item {
  height: 3.5rem;
  padding: 0 0.8rem;
}

.user-account-menu--has-bindings .user-profile-item {
  border-bottom: 1px solid var(--app-border);
}

.user-account-menu .provider-icon {
  width: 1.9rem;
  height: 1.9rem;
  flex-basis: 1.9rem;
}

.user-account-menu .user-logout-item {
  background-color: #fff1f1;
  color: #c93636;
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
