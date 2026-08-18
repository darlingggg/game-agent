import type { EChartsOption } from 'echarts'

const palette = ['#315efb', '#15946c', '#ff5f56', '#8b5cf6', '#0ea5e9']
const mutedText = '#8b93a3'
const gridLine = 'rgba(139, 147, 163, 0.18)'

export interface ChartDatum {
  name: string
  value: number
  color?: string
}

export interface LineDatum {
  name: string
  values: number[]
  color?: string
}

function tooltipValueFormatter(formatter?: (value: number) => string) {
  return (value: unknown) => formatter?.(Number(value)) ?? Number(value).toLocaleString('zh-CN')
}

export function createBarOption(data: ChartDatum[], formatter?: (value: number) => string): EChartsOption {
  return {
    animationDuration: 420,
    grid: { left: 2, right: 38, top: 2, bottom: 2, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: tooltipValueFormatter(formatter),
    },
    xAxis: { type: 'value', show: false, minInterval: 1 },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((item) => item.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: mutedText, fontSize: 11, margin: 8 },
    },
    series: [
      {
        type: 'bar',
        barWidth: 6,
        showBackground: true,
        backgroundStyle: { color: gridLine },
        label: { show: true, position: 'right', color: mutedText, fontSize: 10, formatter: '{c}' },
        emphasis: { focus: 'self' },
        data: data.map((item, index) => ({
          value: item.value,
          itemStyle: { color: item.color ?? palette[index % palette.length], borderRadius: [0, 2, 2, 0] },
        })),
      },
    ],
  }
}

export function createDonutOption(data: ChartDatum[], centerLabel: string, formatter?: (value: number) => string): EChartsOption {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const nonZeroData = data.filter((item) => item.value > 0)
  const hasLegend = nonZeroData.length > 1
  const visibleData = total
    ? nonZeroData.map((item, index) => ({
        name: item.name,
        value: item.value,
        itemStyle: { color: item.color ?? palette[index % palette.length] },
        label:
          index === 0
            ? {
                show: true,
                position: 'center' as const,
                formatter: centerLabel,
                color: mutedText,
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 17,
              }
            : { show: false },
      }))
    : [{ name: '暂无数据', value: 1, itemStyle: { color: gridLine }, label: { show: true, position: 'center' as const, formatter: '暂无数据', color: mutedText, fontSize: 10 } }]

  return {
    animationDuration: 420,
    tooltip: total ? { trigger: 'item', valueFormatter: tooltipValueFormatter(formatter) } : { show: false },
    legend:
      total && hasLegend
        ? {
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            itemWidth: 7,
            itemHeight: 7,
            itemGap: 14,
            textStyle: { color: mutedText, fontSize: 10 },
          }
        : { show: false },
    series: [
      {
        type: 'pie',
        radius: [38, 44],
        center: ['50%', hasLegend ? '43%' : '52%'],
        avoidLabelOverlap: true,
        padAngle: 0,
        labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 3 },
        data: visibleData,
      },
    ],
  }
}

export function createLineOption(labels: string[], series: LineDatum[], formatter?: (value: number) => string): EChartsOption {
  return {
    animationDuration: 450,
    color: series.map((item, index) => item.color ?? palette[index % palette.length] ?? '#315efb'),
    grid: { left: 8, right: 8, top: series.length > 1 ? 25 : 10, bottom: 20, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line', lineStyle: { color: '#8b93a3', type: 'dashed' } },
      valueFormatter: tooltipValueFormatter(formatter),
    },
    legend:
      series.length > 1
        ? {
            top: 0,
            left: 0,
            itemWidth: 12,
            itemHeight: 3,
            textStyle: { color: mutedText, fontSize: 10 },
          }
        : { show: false },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: gridLine } },
      axisTick: { show: false },
      axisLabel: { color: mutedText, fontSize: 9, interval: Math.max(Math.ceil(labels.length / 5) - 1, 0) },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitNumber: 2,
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: gridLine, type: 'dashed' } },
    },
    series: series.map((item) => ({
      name: item.name,
      type: 'line',
      data: item.values,
      smooth: 0.28,
      symbol: 'circle',
      symbolSize: 5,
      showSymbol: false,
      lineStyle: { width: 2 },
      areaStyle: series.length === 1 ? { opacity: 0.08 } : undefined,
      emphasis: { focus: 'series' },
    })),
  }
}
