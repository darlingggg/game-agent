<script setup lang="ts">
import { ArrowDown, SwitchButton } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { reactive, ref } from 'vue'
import { setTokens } from '@/ajax'
import { USER_AVATAR_SVG } from '@/builder/chat/chatAvatars'
import { useLogout } from '@/composables/useLogout'
import { getUserInfo } from '@/http/user'
import type { OAuthLoginResult, OAuthProvider } from '@/http/oauth'
import OAuthProviderIcon from './OAuthProviderIcon.vue'
import OAuthScanDialog from './OAuthScanDialog.vue'

defineOptions({ name: 'UserMenu' })

interface Props {
  nickname?: string
  compact?: boolean
}

withDefaults(defineProps<Props>(), {
  nickname: '',
  compact: false,
})

const { confirmLogout } = useLogout()
const dialogVisible = ref(false)
const activeProvider = ref<OAuthProvider>('qq')
const profileLoading = ref(false)
const bindings = reactive({ qq: false, wechat: false })

async function refreshBindings() {
  profileLoading.value = true
  try {
    const profile = await getUserInfo()
    bindings.qq = profile.bindings?.qq ?? false
    bindings.wechat = profile.bindings?.wechat ?? false
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    profileLoading.value = false
  }
}

function openBindDialog(provider: OAuthProvider) {
  activeProvider.value = provider
  dialogVisible.value = true
}

function handleMenuCommand(command: string) {
  if (command === 'logout') {
    void confirmLogout()
    return
  }
  if (command === 'bind-qq') openBindDialog('qq')
  if (command === 'bind-wechat') openBindDialog('wechat')
}

async function handleBindSuccess(result: OAuthLoginResult) {
  setTokens(result.accessToken, result.refreshToken)
  dialogVisible.value = false
  await refreshBindings()
  ElMessage.success(`${activeProvider.value === 'qq' ? 'QQ' : '微信'}绑定成功`)
}

function handleDropdownVisible(visible: boolean) {
  if (visible) void refreshBindings()
}
</script>

<template>
  <el-dropdown trigger="click" @command="handleMenuCommand" @visible-change="handleDropdownVisible">
    <button type="button" class="user-menu-trigger" :class="{ 'user-menu-trigger--compact': compact }">
      <span class="user-menu-avatar" aria-hidden="true" v-html="USER_AVATAR_SVG" />
      <span v-if="nickname" class="user-menu-name">{{ nickname }}</span>
      <el-icon v-if="!compact" class="user-menu-arrow"><ArrowDown /></el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu class="user-account-menu">
        <el-dropdown-item v-if="!bindings.qq" command="bind-qq" :disabled="profileLoading" class="user-bind-item">
          <OAuthProviderIcon provider="qq" beta />
          <span class="user-bind-copy"><strong>绑定 QQ</strong><small>扫码关联当前账号</small></span>
        </el-dropdown-item>
        <el-dropdown-item v-if="!bindings.wechat" command="bind-wechat" :disabled="profileLoading" class="user-bind-item">
          <OAuthProviderIcon provider="wechat" beta />
          <span class="user-bind-copy"><strong>绑定微信</strong><small>扫码关联当前账号</small></span>
        </el-dropdown-item>
        <el-dropdown-item divided command="logout">
          <el-icon><SwitchButton /></el-icon>
          退出登录
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>

  <OAuthScanDialog v-model="dialogVisible" :provider="activeProvider" mode="bind" @success="handleBindSuccess" />
</template>

<style scoped>
.user-menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background-color: var(--app-surface);
  color: var(--app-text-primary);
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.user-menu-trigger--compact {
  width: 100%;
  justify-content: flex-start;
  padding: 0.625rem 0.75rem;
}

.user-menu-trigger:hover {
  border-color: var(--app-accent);
  background-color: var(--app-accent-soft);
}

.user-menu-avatar {
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  line-height: 0;
}

.user-menu-avatar :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
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

.user-account-menu .provider-icon {
  width: 1.9rem;
  height: 1.9rem;
  flex-basis: 1.9rem;
}
</style>
