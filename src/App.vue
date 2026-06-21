<script setup lang="ts">
import { RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { applyThemeMode } from '@/utils/theme'

const themeStore = useThemeStore()
const { mode } = storeToRefs(themeStore)

/** 监听主题变化并同步到 document */
watch(mode, (value) => applyThemeMode(value), { immediate: true })
</script>

<template>
  <router-view />
</template>
