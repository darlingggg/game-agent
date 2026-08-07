<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { USER_AVATAR_URL } from '@/builder/chat/chatAvatars'

defineOptions({ name: 'UserAvatar' })

interface Props {
  avatar?: string | null
  alt?: string
}

const props = withDefaults(defineProps<Props>(), {
  avatar: '',
  alt: '',
})

const loadFailed = ref(false)

/** 仅接受可由浏览器安全加载的 HTTP(S) 地址或站内绝对路径。 */
const normalizedAvatar = computed(() => {
  const value = props.avatar?.trim()
  if (!value) return ''

  try {
    const url = new URL(value, window.location.origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
})

const useFallback = computed(() => !normalizedAvatar.value || loadFailed.value)
const displayUrl = computed(() => (useFallback.value ? USER_AVATAR_URL : normalizedAvatar.value))

watch(
  () => props.avatar,
  () => {
    loadFailed.value = false
  },
)
</script>

<template>
  <img class="user-avatar-image" :class="{ 'user-avatar-image--fallback': useFallback }" :src="displayUrl" :alt="alt" @error="loadFailed = true" />
</template>

<style scoped>
.user-avatar-image {
  display: block;
  object-fit: cover;
}

:global(html.dark .user-avatar-image--fallback) {
  filter: invert(1);
}
</style>
