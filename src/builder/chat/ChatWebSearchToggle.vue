<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [enabled: boolean] }>()
const animationKey = ref(0)
function toggle() {
  if (props.disabled) return
  animationKey.value += 1
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    class="chat-web-search-toggle"
    :class="{ 'is-enabled': modelValue }"
    :aria-pressed="modelValue"
    aria-label="联网搜索"
    :title="disabled ? '回复生成期间不可切换联网搜索' : modelValue ? '联网搜索已开启' : '联网搜索已关闭'"
    :disabled="disabled"
    @click="toggle"
  >
    <svg :key="animationKey" class="web-search-globe" :class="{ 'is-animating': animationKey > 0 }" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.3" stroke="currentColor" stroke-width="1.3" />
      <ellipse cx="10" cy="10" rx="3.2" ry="7.3" stroke="currentColor" stroke-width="1.2" />
      <path d="M3 10h14M4.4 5.6c3.5 1.5 7.7 1.5 11.2 0M4.4 14.4c3.5-1.5 7.7-1.5 11.2 0" stroke="currentColor" stroke-width="1.1" />
    </svg>
    <span>联网搜索</span>
  </button>
</template>

<style scoped>
.chat-web-search-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 30px;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-secondary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}
.chat-web-search-toggle:hover:not(:disabled) {
  background: var(--app-bg-subtle);
  color: var(--app-text-primary);
}
.chat-web-search-toggle.is-enabled {
  border-color: color-mix(in srgb, var(--app-accent) 48%, transparent);
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.chat-web-search-toggle:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.chat-web-search-toggle:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.web-search-globe {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  transform-origin: center;
}
.web-search-globe.is-animating {
  animation: web-search-turn 600ms cubic-bezier(0.22, 0.7, 0.3, 1);
}
@keyframes web-search-turn {
  0% {
    transform: rotate(-20deg) scale(0.85);
  }
  50% {
    transform: rotate(180deg) scale(1.1);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-web-search-toggle {
    transition: none;
  }
  .web-search-globe.is-animating {
    animation: none;
  }
}
</style>
