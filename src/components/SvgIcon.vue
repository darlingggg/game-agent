<script setup lang="ts">
defineOptions({ name: 'SvgIcon' })

defineProps<{
  name: string
}>()
</script>

<template>
  <svg aria-hidden="true" focusable="false">
    <use :href="`/svgs/ui-icons.svg#${name}`" />
  </svg>
</template>
