<script setup lang="ts">
import type { OAuthProvider } from '@/http/oauth'

defineOptions({ name: 'OAuthProviderIcon' })

interface Props {
  provider: OAuthProvider
  beta?: boolean
}

withDefaults(defineProps<Props>(), {
  beta: false,
})
</script>

<template>
  <span class="provider-icon" :class="`provider-icon--${provider}`" aria-hidden="true">
    <svg v-if="provider === 'wechat'" viewBox="0 0 32 32" role="img">
      <path d="M13.2 5.3C6.9 5.3 2 9.4 2 14.4c0 2.8 1.6 5.3 4.2 7l-1 3.5 3.9-2a13.7 13.7 0 0 0 4.1.6h.8a8.8 8.8 0 0 1-.4-2.5c0-5.1 4.8-9.3 10.9-9.5-1.7-3.6-6-6.2-11.3-6.2Zm-3.8 5.2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7.7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
      <path d="M30 20.9c0-4.2-4.1-7.6-9.1-7.6s-9.1 3.4-9.1 7.6 4.1 7.6 9.1 7.6c1 0 2-.2 2.9-.4l3.3 1.7-.8-3c2.3-1.4 3.7-3.5 3.7-5.9Zm-12.2-1a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm6.3 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z" />
    </svg>
    <span v-else class="provider-icon-qq">Q</span>
    <span v-if="beta" class="provider-beta">BETA</span>
  </span>
</template>

<style scoped>
.provider-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 2.25rem;
  border-radius: 50%;
  color: #fff;
}

.provider-icon svg {
  width: 1.55rem;
  height: 1.55rem;
  fill: currentColor;
}

.provider-icon--wechat {
  background: #07c160;
}

.provider-icon--qq {
  background: #17191d;
}

.provider-icon-qq {
  font-family: Arial, sans-serif;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1;
}

.provider-beta {
  position: absolute;
  top: -0.35rem;
  right: -0.55rem;
  min-width: 1.6rem;
  padding: 0.15rem 0.28rem;
  border: 2px solid var(--app-surface);
  border-radius: 0.35rem;
  background: #ff5b45;
  color: #fff;
  font-family: Arial, sans-serif;
  font-size: 0.46rem;
  font-weight: 800;
  line-height: 1;
  text-align: center;
}
</style>
