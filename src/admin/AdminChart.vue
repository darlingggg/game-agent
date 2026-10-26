<script setup lang="ts">
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'

defineOptions({ name: 'AdminChart' })

defineProps<{
  option: EChartsOption
  label: string
}>()

use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent])
</script>

<template>
  <VChart class="admin-chart-canvas" :option="option" theme="dark" autoresize :aria-label="label" />
</template>

<style scoped>
.admin-chart-canvas {
  width: 100%;
  height: 100%;
  min-height: 84px;
}
</style>
