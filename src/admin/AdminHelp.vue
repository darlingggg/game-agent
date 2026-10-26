<script setup lang="ts">
defineProps<{ text: string; label: string }>()
</script>

<template>
  <el-tooltip :content="text" trigger="click" placement="top" :popper-style="{ maxWidth: '280px', whiteSpace: 'normal', lineHeight: '1.6' }">
    <button type="button" class="admin-help" :aria-label="label"><span aria-hidden="true">?</span></button>
  </el-tooltip>
</template>

<style scoped>
.admin-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 3px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  vertical-align: middle;
}
.admin-help span {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border: 1px solid currentColor;
  border-radius: 50%;
  font: 600 11px/1 sans-serif;
}
.admin-help:hover {
  color: var(--app-text-primary);
  background: var(--app-bg-subtle);
}
.admin-help:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
</style>
