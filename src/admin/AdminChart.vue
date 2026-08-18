<script setup lang="ts">
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import { storeToRefs } from 'pinia'
import VChart from 'vue-echarts'
import { useThemeStore } from '@/stores/theme'

defineOptions({ name: 'AdminChart' })

defineProps<{
  option: EChartsOption
  label: string
}>()

use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent])

const { mode } = storeToRefs(useThemeStore())
</script>

<template>
  <VChart :key="mode" class="admin-chart-canvas" :option="option" :theme="mode === 'dark' ? 'dark' : undefined" autoresize :aria-label="label" />
</template>

<style scoped>
.admin-chart-canvas {
  width: 100%;
  height: 100%;
  min-height: 84px;
}
</style>
