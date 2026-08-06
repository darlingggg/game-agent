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
    <img :src="`/svgs/${provider}.svg`" alt="" />
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

.provider-icon img {
  width: 1.55rem;
  height: 1.55rem;
  object-fit: contain;
}

.provider-icon--wechat {
  background: #07c160;
}

.provider-icon--qq {
  border: 1px solid #dfe2e7;
  background: #fff;
}

.provider-icon--qq img {
  width: 1.85rem;
  height: 1.85rem;
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
