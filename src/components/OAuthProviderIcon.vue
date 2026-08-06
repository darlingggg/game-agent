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
  top: -0.22rem;
  right: -0.38rem;
  min-width: 1.15rem;
  padding: 0.08rem 0.18rem;
  border: 1.5px solid var(--app-surface);
  border-radius: 0.25rem;
  background: #ff5b45;
  color: #fff;
  font-family: Arial, sans-serif;
  font-size: 0.36rem;
  font-weight: 800;
  line-height: 1;
  text-align: center;
}
</style>
