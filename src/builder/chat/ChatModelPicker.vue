<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ClickOutside as vClickOutside } from 'element-plus'
import { effortLabel, type AiModel } from '@/http/models'

const props = defineProps<{
  models: AiModel[]
  model: string
  effort: string | null
  disabled: boolean
  loading: boolean
}>()
const emit = defineEmits<{
  'update:model': [value: string]
  'update:effort': [value: string | null]
  reload: []
}>()

const modelVisible = ref(false)
const effortVisible = ref(false)
const switchingToModels = ref(false)
const modelTrigger = ref<HTMLButtonElement | null>(null)
const effortTrigger = ref<HTMLButtonElement | null>(null)
const modelMenu = ref<HTMLDivElement | null>(null)
const effortMenu = ref<HTMLDivElement | null>(null)
const currentModel = computed(() => props.models.find((model) => model.modelKey === props.model))
const defaultModel = computed(() => props.models.find((model) => model.isDefault) || props.models[0])
const levels = computed(() => currentModel.value?.effort?.supportedLevels || [])
const defaultLevel = computed(() => {
  const preferred = currentModel.value?.effort?.defaultLevel
  return preferred && levels.value.includes(preferred) ? preferred : levels.value[0]
})
const effortIndex = computed(() => Math.max(0, levels.value.indexOf(props.effort || defaultLevel.value || '')))
const currentEffort = computed(() => effortLabel(levels.value[effortIndex.value] || ''))
const sliderValue = ref(0)
watch(
  effortIndex,
  (value) => {
    sliderValue.value = value
  },
  { immediate: true },
)
const formatEffortValue = (value: number) => effortLabel(levels.value[value] || '')
const modelLabel = computed(() => (props.loading ? '加载模型…' : currentModel.value?.modelName || (props.model ? `${props.model}（已失效）` : '选择模型')))

function selectModel(model: AiModel) {
  if (model.modelKey !== props.model) {
    emit('update:model', model.modelKey)
    emit('update:effort', null)
  }
  closeModel()
}
function closeModel() {
  switchingToModels.value = false
  modelVisible.value = false
  effortVisible.value = false
  void nextTick(() => modelTrigger.value?.focus())
}
function closeEffort() {
  switchingToModels.value = false
  effortVisible.value = false
  void nextTick(() => effortTrigger.value?.focus())
}
function changeEffort(value: number | number[]) {
  if (typeof value !== 'number') return
  const level = levels.value[value]
  if (level) emit('update:effort', level)
}
function openModelMenu() {
  if (props.disabled || props.loading) return
  switchingToModels.value = true
  effortVisible.value = false
}
function finishModelSwitch() {
  if (!switchingToModels.value) return
  switchingToModels.value = false
  if (props.disabled || props.loading) return
  modelVisible.value = true
  void nextTick(() => {
    modelTrigger.value?.focus()
  })
}
function openSettings() {
  if (props.disabled || props.loading) return
  switchingToModels.value = false
  if (currentModel.value && levels.value.length) {
    const open = !effortVisible.value || modelVisible.value
    modelVisible.value = false
    effortVisible.value = open
  } else {
    modelVisible.value = !modelVisible.value
  }
}
function closeOnOutside(event: MouseEvent, downEvent?: MouseEvent) {
  const targets = [event.target, downEvent?.target]
  if (targets.some((target) => target instanceof Node && (modelMenu.value?.contains(target) || effortMenu.value?.contains(target)))) return
  switchingToModels.value = false
  modelVisible.value = false
  effortVisible.value = false
}
watch(modelVisible, (visible) => {
  if (visible) effortVisible.value = false
})
watch(effortVisible, (visible) => {
  if (visible) modelVisible.value = false
})
watch(
  () => props.disabled || props.loading,
  (disabled) => {
    if (disabled) {
      switchingToModels.value = false
      modelVisible.value = false
      effortVisible.value = false
    }
  },
)
watch(
  () => props.model,
  () => {
    switchingToModels.value = false
    effortVisible.value = false
  },
)
</script>

<template>
  <div v-click-outside="closeOnOutside" class="chat-model-picker">
    <el-popover
      v-model:visible="modelVisible"
      placement="top-end"
      :trigger="[]"
      :trigger-keys="[]"
      transition="chat-picker-popover"
      :hide-after="0"
      :width="260"
      :disabled="disabled || loading"
      :popper-style="{ maxWidth: 'calc(100vw - 24px)', padding: '6px' }"
    >
      <template #reference>
        <button
          ref="modelTrigger"
          type="button"
          class="chat-model-trigger"
          :class="{ 'is-open': modelVisible || effortVisible }"
          :disabled="disabled || loading"
          :title="modelLabel"
          aria-label="模型和思考强度"
          aria-haspopup="dialog"
          :aria-expanded="modelVisible || effortVisible"
          @click.stop="openSettings"
          @keydown.esc.stop="closeModel"
        >
          <span class="chat-model-name">{{ modelLabel }}</span>
          <svg v-if="!currentModel || !levels.length" class="chat-model-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </template>
      <div ref="modelMenu" class="chat-model-menu" role="dialog" aria-label="选择模型" @keydown.esc.stop="closeModel">
        <p class="chat-model-menu-label">选择模型</p>
        <button v-if="defaultModel" type="button" class="chat-model-option chat-model-default" @click="selectModel(defaultModel)">
          <span
            >默认<small>{{ defaultModel.modelName }}</small></span
          >
        </button>
        <div v-if="models.length" class="chat-model-options" role="group" aria-label="可用模型">
          <button
            v-for="item in models"
            :key="item.modelKey"
            type="button"
            class="chat-model-option"
            :class="{ 'is-selected': item.modelKey === model }"
            :aria-pressed="item.modelKey === model"
            @click="selectModel(item)"
          >
            <span>{{ item.modelName }}</span>
            <svg v-if="item.modelKey === model" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
        <div v-else class="chat-model-empty">
          <p>暂无可用模型，请联系管理员同步。</p>
          <button type="button" @click="emit('reload')">重新获取</button>
        </div>
      </div>
    </el-popover>
    <el-popover
      v-if="currentModel && levels.length"
      v-model:visible="effortVisible"
      placement="top-end"
      trigger="click"
      transition="chat-picker-popover"
      :hide-after="0"
      @after-leave="finishModelSwitch"
      :width="260"
      :disabled="disabled || loading"
      :popper-style="{ maxWidth: 'calc(100vw - 24px)', padding: '14px' }"
    >
      <template #reference>
        <button
          ref="effortTrigger"
          type="button"
          class="chat-effort-trigger"
          :class="{ 'is-open': effortVisible }"
          :disabled="disabled || loading"
          :title="`推理强度：${currentEffort}`"
          aria-label="选择强度"
          aria-haspopup="dialog"
          :aria-expanded="effortVisible"
          @keydown.esc.stop="closeEffort"
        >
          <span>{{ currentEffort }}</span>
          <svg class="chat-model-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </template>
      <div ref="effortMenu" class="chat-effort-menu" role="dialog" aria-label="选择强度" @keydown.esc.stop="closeEffort">
        <button type="button" class="chat-effort-reset" aria-label="使用默认强度" :title="`默认：${effortLabel(defaultLevel || '')}`" @click="emit('update:effort', null)">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M13 6a5 5 0 1 0 .1 4M13 2v4H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="chat-effort-heading" aria-label="切换模型" aria-haspopup="dialog" :disabled="disabled || loading" @click.stop="openModelMenu">
          <strong class="chat-effort-value">{{ currentEffort }}</strong>
          <span class="chat-effort-model"
            >{{ currentModel.modelName }}
            <svg class="chat-model-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m6 4 4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>
        <div class="chat-effort-slider">
          <el-slider
            v-model="sliderValue"
            :min="0"
            :max="Math.max(levels.length - 1, 1)"
            :step="1"
            :show-stops="true"
            :show-tooltip="false"
            :format-value-text="formatEffortValue"
            :disabled="disabled || loading || levels.length < 2"
            aria-label="推理强度"
            @input="changeEffort"
          />
        </div>
      </div>
    </el-popover>
  </div>
</template>

<style scoped>
.chat-model-picker {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: min(240px, 46vw);
  border-radius: 6px;
}
.chat-model-trigger,
.chat-effort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 2rem;
  padding: 0 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    opacity 160ms ease;
}
.chat-model-trigger {
  min-width: 0;
  color: var(--app-text-primary);
}
.chat-effort-trigger {
  flex-shrink: 0;
  color: var(--app-text-secondary);
}
.chat-model-trigger:hover:not(:disabled),
.chat-effort-trigger:hover:not(:disabled),
.is-open {
  background: var(--app-bg-subtle);
}
.chat-model-trigger:disabled,
.chat-effort-trigger:disabled {
  cursor: default;
  opacity: 0.55;
}
.chat-model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.chat-model-chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--app-text-secondary);
  transition: transform 180ms ease;
}
.chat-effort-trigger.is-open .chat-model-chevron {
  transform: rotate(180deg);
}
.chat-model-menu,
.chat-effort-menu {
  color: var(--app-text-primary);
  font-size: 13px;
}
.chat-model-menu-label {
  padding: 6px 8px;
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 11px;
}
.chat-model-options {
  max-height: 240px;
  overflow-y: auto;
}
.chat-model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 10px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.chat-model-option span {
  overflow-wrap: anywhere;
}
.chat-model-option small {
  display: block;
  margin-top: 3px;
  color: var(--app-text-secondary);
  font-size: 11px;
}
.chat-model-option svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.chat-model-option:hover,
.chat-model-option.is-selected {
  background: var(--app-bg-subtle);
}
.chat-model-default {
  margin-bottom: 4px;
}
.chat-model-trigger:focus-visible,
.chat-effort-trigger:focus-visible,
.chat-model-menu button:focus-visible,
.chat-effort-menu button:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.chat-model-empty {
  padding: 8px;
  color: var(--app-text-secondary);
}
.chat-model-empty p {
  margin: 0 0 8px;
}
.chat-model-empty button {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--app-accent);
  font: inherit;
  cursor: pointer;
}
.chat-effort-menu {
  position: relative;
  padding: 2px 0 0;
  text-align: center;
}
.chat-effort-heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: calc(100% - 48px);
  margin: 0 24px 14px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.chat-effort-heading:hover:not(:disabled) {
  background: var(--app-bg-subtle);
}
.chat-effort-heading:disabled {
  cursor: default;
  opacity: 0.55;
}
.chat-effort-value {
  display: block;
  color: var(--app-accent);
  font-size: 14px;
  font-weight: 600;
}
.chat-effort-model {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.chat-effort-reset {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
}
.chat-effort-reset svg {
  width: 14px;
  height: 14px;
}
.chat-effort-reset:hover {
  background: var(--app-bg-subtle);
}
.chat-effort-slider {
  margin: 0 12px;
}
.chat-effort-slider :deep(.el-slider) {
  --el-slider-main-bg-color: var(--app-accent);
  --el-slider-runway-bg-color: var(--app-border-strong);
  --el-slider-height: 18px;
  --el-slider-border-radius: 20px;
  --el-slider-button-size: 24px;
  --el-slider-button-wrapper-offset: -9px;
}
.chat-effort-slider :deep(.el-slider__bar) {
  border-radius: 20px;
  transition: width 180ms ease-out;
}
.chat-effort-slider :deep(.el-slider__button-wrapper) {
  transition: left 180ms ease-out;
}
.chat-effort-slider :deep(.el-slider__button-wrapper.dragging),
.chat-effort-slider :deep(.el-slider__runway:has(.el-slider__button-wrapper.dragging) .el-slider__bar) {
  transition: none;
}
.chat-effort-slider :deep(.el-slider__stop) {
  width: 4px;
  height: 4px;
  top: 50%;
  transform: translate(-50%, -50%);
  background: var(--app-text-secondary);
}
.chat-effort-slider :deep(.el-slider__button) {
  border: 1px solid var(--app-border);
  background: #fff;
  box-shadow: 0 1px 3px #0002;
}
.chat-effort-slider :deep(.el-slider__button-wrapper:focus-visible .el-slider__button) {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}

:global(.chat-picker-popover-enter-active) {
  transition: opacity 180ms ease-out;
}
:global(.chat-picker-popover-leave-active) {
  transition: opacity 140ms ease-in;
}
:global(.chat-picker-popover-enter-from),
:global(.chat-picker-popover-leave-to) {
  opacity: 0;
}
.chat-model-menu,
.chat-effort-menu {
  transform-origin: bottom right;
}
:global(.chat-picker-popover-enter-active .chat-model-menu),
:global(.chat-picker-popover-enter-active .chat-effort-menu) {
  transition: transform 180ms ease-out;
}
:global(.chat-picker-popover-leave-active .chat-model-menu),
:global(.chat-picker-popover-leave-active .chat-effort-menu) {
  transition: transform 140ms ease-in;
}
:global(.chat-picker-popover-enter-from .chat-model-menu),
:global(.chat-picker-popover-enter-from .chat-effort-menu) {
  transform: translateY(6px) scale(0.97);
}
:global(.chat-picker-popover-leave-to .chat-model-menu),
:global(.chat-picker-popover-leave-to .chat-effort-menu) {
  transform: translateY(4px) scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  :global(.chat-picker-popover-enter-active),
  :global(.chat-picker-popover-leave-active) {
    transition-duration: 0.01ms;
  }
  .chat-model-chevron,
  .chat-model-trigger,
  .chat-effort-trigger,
  :global(.chat-picker-popover-enter-active .chat-model-menu),
  :global(.chat-picker-popover-enter-active .chat-effort-menu),
  :global(.chat-picker-popover-leave-active .chat-model-menu),
  :global(.chat-picker-popover-leave-active .chat-effort-menu),
  .chat-effort-slider :deep(.el-slider__bar),
  .chat-effort-slider :deep(.el-slider__button-wrapper) {
    transition: none;
  }
}
</style>
