<script setup lang="ts">
import { ArrowDown, SwitchButton } from '@element-plus/icons-vue'
import { useLogout } from '@/composables/useLogout'
import { USER_AVATAR_SVG } from '@/builder/chat/chatAvatars'

defineOptions({
  name: 'UserMenu',
})

interface Props {
  /** 用户昵称 */
  nickname?: string
  /** 是否紧凑展示（用于侧栏底部） */
  compact?: boolean
}

withDefaults(defineProps<Props>(), {
  nickname: '',
  compact: false,
})

const { confirmLogout } = useLogout()

/**
 * 处理下拉菜单命令
 * @param command 菜单命令
 */
function handleMenuCommand(command: string) {
  if (command === 'logout') {
    void confirmLogout()
  }
}
</script>

<template>
  <el-dropdown trigger="click" @command="handleMenuCommand">
    <button type="button" class="user-menu-trigger" :class="{ 'user-menu-trigger--compact': compact }">
      <span class="user-menu-avatar" aria-hidden="true" v-html="USER_AVATAR_SVG" />
      <span v-if="nickname" class="user-menu-name">{{ nickname }}</span>
      <el-icon v-if="!compact" class="user-menu-arrow">
        <ArrowDown />
      </el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="logout">
          <el-icon>
            <SwitchButton />
          </el-icon>
          退出登录
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
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
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
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
  font-size: 0.875rem;
  line-height: 1;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu-trigger--compact .user-menu-name {
  flex: 1;
  max-width: none;
}

.user-menu-arrow {
  font-size: 0.75rem;
  color: var(--app-text-muted);
}
</style>
