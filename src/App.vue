<script setup lang="ts">
import { RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
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
  <ElConfigProvider :locale="zhCn"
    ><RouterView v-slot="{ Component, route }"><component :is="Component" :key="route.path === '/builder' ? `builder:${route.query.projectId}` : route.path" /></RouterView
  ></ElConfigProvider>
</template>
