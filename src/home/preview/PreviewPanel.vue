<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { startProjectTempPreview } from './webcontainer'

defineOptions({
  name: 'PreviewPanel',
})

/** iframe 预览地址 */
const previewUrl = ref('')

/** 加载状态文案 */
const statusText = ref('正在准备预览...')

/** 错误信息 */
const errorText = ref('')

onMounted(async () => {
  try {
    previewUrl.value = await startProjectTempPreview((status) => {
      statusText.value = status
    })
    statusText.value = ''
  } catch (error) {
    statusText.value = ''
    errorText.value = error instanceof Error ? error.message : '预览启动失败'
  }
})
</script>

<template>
  <div class="preview-panel">
    <div class="phone-frame">
      <div class="phone-notch" aria-hidden="true" />
      <div class="phone-screen">
        <iframe v-if="previewUrl" class="preview-iframe" :src="previewUrl" title="项目预览" />
        <div v-else-if="errorText" class="preview-placeholder preview-placeholder--error">
          {{ errorText }}
        </div>
        <div v-else class="preview-placeholder">
          {{ statusText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  background-color: #fcfcfd;
}

.phone-frame {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  border: 2px solid #1a1a1a;
  border-radius: 2.5rem;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.phone-notch {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 0.625rem 0 0.375rem;
}

.phone-notch::before {
  content: '';
  width: 6.5rem;
  height: 1.625rem;
  background-color: #000;
  border-radius: 999px;
}

.phone-screen {
  flex: 1;
  min-height: 0;
  background-color: #fff;
  overflow: hidden;
  position: relative;
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background-color: #fff;
}

.preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  color: #000;
  font-size: 0.85rem;
  text-align: center;
}

.preview-placeholder--error {
  color: #c0392b;
}
</style>
