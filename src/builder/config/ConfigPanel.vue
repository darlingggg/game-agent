<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { onMounted, reactive, ref, watch } from 'vue'
import { useAppearanceStore } from '@/stores/appearance'
import { useProjectStore } from '@/stores/project'
import { saveProjectConfig } from '@/utils/projectConfig'
import { syncPreviewFile } from '../preview/webcontainer'
import { fetchProjectTempFileContent } from '../file/projectTempFiles'
import { INDEX_HTML_PATH, parseProjectHtmlConfig } from './projectHtmlConfig'
import type { ThemeMode } from './appearanceConfig'

defineOptions({
  name: 'ConfigPanel',
})

/** 主题选项 */
const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const appearanceStore = useAppearanceStore()
const projectStore = useProjectStore()
const { theme, backgroundColor, effectiveBackgroundColor } = storeToRefs(appearanceStore)

/** 项目信息表单 */
const projectForm = reactive({
  name: '',
  description: '',
})

/** 项目信息加载中 */
const projectLoading = ref(false)

/** 项目信息保存中 */
const projectSaving = ref(false)

/** 颜色选择器绑定值，空配置时使用 null 展示占位 */
const pickerColor = ref<string | null>(null)

onMounted(async () => {
  pickerColor.value = backgroundColor.value || null

  projectLoading.value = true
  try {
    const html = await fetchProjectTempFileContent(INDEX_HTML_PATH)
    const config = parseProjectHtmlConfig(html)
    projectForm.name = config.name
    projectForm.description = config.description
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目信息加载失败')
  } finally {
    projectLoading.value = false
  }
})

watch(backgroundColor, (color) => {
  pickerColor.value = color || null
})

/**
 * 同步颜色选择器与输入框
 * @param color 选中的颜色
 */
function handleColorChange(color: string | null) {
  appearanceStore.setBackgroundColor(color ?? '')
}

/**
 * 清空自定义背景色，回退到主题默认
 */
function clearBackgroundColor() {
  appearanceStore.setBackgroundColor('')
  pickerColor.value = null
}

/**
 * 切换默认主题
 * @param value 主题模式
 */
function handleThemeChange(value: ThemeMode) {
  appearanceStore.setTheme(value)
}

/**
 * 保存项目信息：更新后端项目配置并同步 index.html
 */
async function handleSaveProject() {
  const project = projectStore.currentProject
  if (!project || projectSaving.value) return

  const title = projectForm.name.trim()
  if (!title) {
    ElMessage.warning('请输入项目名称')
    return
  }

  projectSaving.value = true
  try {
    const updatedHtml = await saveProjectConfig({
      id: project.id,
      dirPath: project.dirPath,
      title,
      desc: projectForm.description,
    })
    projectStore.patchProject(project.id, {
      title,
      desc: projectForm.description.trim(),
    })
    await syncPreviewFile(INDEX_HTML_PATH, updatedHtml)
    ElMessage.success('项目信息保存成功')
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    projectSaving.value = false
  }
}
</script>

<template>
  <div class="config-panel">
    <header class="config-panel-header">
      <h1 class="config-panel-title">配置</h1>
    </header>

    <div class="config-panel-body">
      <section class="config-section">
        <div v-loading="projectLoading" class="config-section-card">
          <div class="config-section-head">
            <h2 class="config-section-title">项目信息</h2>
            <p class="config-section-desc">同步更新项目标题与 index.html 描述</p>
          </div>

          <el-form class="config-form" label-position="top" @submit.prevent="handleSaveProject">
            <el-form-item label="项目名">
              <el-input v-model="projectForm.name" placeholder="请输入项目名称" clearable />
            </el-form-item>
            <el-form-item label="项目描述">
              <el-input
                v-model="projectForm.description"
                type="textarea"
                :rows="3"
                placeholder="请输入项目描述（选填）"
                resize="none"
              />
            </el-form-item>
            <div class="config-form-footer">
              <button
                type="button"
                class="config-action-btn"
                :class="{ 'config-action-btn--loading': projectSaving }"
                :disabled="projectSaving || projectLoading"
                @click="handleSaveProject"
              >
                {{ projectSaving ? '保存中...' : '保存' }}
              </button>
            </div>
          </el-form>
        </div>
      </section>

      <section class="config-section">
        <div class="config-section-card">
          <div class="config-section-head">
            <h2 class="config-section-title">外观</h2>
            <p class="config-section-desc">影响预览默认主题与背景，供 AI 生成时参考</p>
          </div>

          <el-form class="config-form" label-position="top">
            <el-form-item label="默认主题">
              <div class="config-theme-toggle" role="radiogroup" aria-label="默认主题">
                <button
                  v-for="option in THEME_OPTIONS"
                  :key="option.value"
                  type="button"
                  class="config-theme-option"
                  :class="{ 'config-theme-option--active': theme === option.value }"
                  role="radio"
                  :aria-checked="theme === option.value"
                  @click="handleThemeChange(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </el-form-item>

            <el-form-item label="背景色">
              <div class="config-color-row">
                <span
                  class="config-color-preview"
                  :style="{ backgroundColor: effectiveBackgroundColor }"
                  :title="effectiveBackgroundColor"
                  aria-hidden="true"
                />
                <el-input
                  v-model="backgroundColor"
                  class="config-color-input"
                  placeholder="不填则使用当前主题默认背景"
                  clearable
                  @clear="clearBackgroundColor"
                />
                <el-color-picker
                  v-model="pickerColor"
                  class="config-color-picker"
                  show-alpha
                  @change="handleColorChange"
                />
              </div>
              <p class="config-field-hint">留空时跟随主题默认背景色</p>
            </el-form-item>
          </el-form>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 浅色主题：与模板/快照面板一致的克制风格 */
.config-panel {
  --config-accent-bg: #eef4ff;
  --config-accent-bg-hover: #dbe8ff;
  --config-accent-text: #1e4fa8;
  --config-accent-text-muted: #5b7fc7;
  --config-accent-border: #c7daff;
  --config-accent-border-hover: #a3c4ff;
  --config-group-border: var(--app-border);
  --config-radius-sm: 2px;
  --config-radius-md: 4px;

  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* 深色主题 */
html.dark .config-panel {
  --config-accent-bg: #1a2744;
  --config-accent-bg-hover: #223358;
  --config-accent-text: #9ec0ff;
  --config-accent-text-muted: #7a9fd4;
  --config-accent-border: #2d4470;
  --config-accent-border-hover: #3d5a8c;
  --config-group-border: var(--app-border);
}

.config-panel::-webkit-scrollbar {
  display: none;
}

.config-panel-header {
  margin-bottom: 0.75rem;
}

.config-panel-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
  line-height: 1.2;
}

.config-panel-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.config-section-card {
  border: 1px solid var(--config-group-border);
  border-radius: var(--config-radius-md);
  background: var(--app-surface);
  overflow: hidden;
}

.config-section-head {
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid var(--config-accent-border);
  background: var(--config-accent-bg);
}

.config-section-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--config-accent-text);
  line-height: 1.35;
}

.config-section-desc {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--config-accent-text-muted);
  line-height: 1.45;
}

.config-form {
  padding: 0.875rem;
}

.config-form :deep(.el-form-item) {
  margin-bottom: 0.875rem;
}

.config-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.config-form :deep(.el-form-item__label) {
  margin-bottom: 0.375rem;
  padding: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--app-text-primary);
  line-height: 1.35;
}

.config-form :deep(.el-input__wrapper),
.config-form :deep(.el-textarea__inner) {
  border-radius: var(--config-radius-sm);
  box-shadow: 0 0 0 1px var(--config-group-border) inset;
  background-color: var(--app-bg-subtle);
}

.config-form :deep(.el-input__wrapper:hover),
.config-form :deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px var(--config-accent-border) inset;
}

.config-form :deep(.el-input__wrapper.is-focus),
.config-form :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px var(--config-accent-border-hover) inset;
}

.config-form :deep(.el-input__inner),
.config-form :deep(.el-textarea__inner) {
  font-size: 0.8125rem;
  color: var(--app-text-primary);
}

.config-form :deep(.el-textarea__inner) {
  min-height: 4.5rem !important;
  padding: 0.5rem 0.625rem;
}

.config-form-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
}

.config-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  padding: 0 0.875rem;
  border: 1px solid var(--config-accent-border);
  border-radius: var(--config-radius-md);
  background: var(--config-accent-bg);
  color: var(--config-accent-text);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.config-action-btn:hover:not(:disabled) {
  background: var(--config-accent-bg-hover);
  border-color: var(--config-accent-border-hover);
}

.config-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.config-action-btn--loading {
  cursor: wait;
}

.config-theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.config-theme-option {
  height: 2rem;
  padding: 0 0.875rem;
  border: 1px solid var(--config-group-border);
  border-radius: var(--config-radius-md);
  background: var(--app-bg-subtle);
  color: var(--app-text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.config-theme-option:hover {
  border-color: var(--config-accent-border);
  color: var(--config-accent-text);
}

.config-theme-option--active {
  border-color: var(--config-accent-border);
  background: var(--config-accent-bg);
  color: var(--config-accent-text);
}

.config-color-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.config-color-preview {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--config-group-border);
  border-radius: var(--config-radius-sm);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04) inset;
}

.config-color-input {
  flex: 1;
  min-width: 0;
}

.config-color-picker :deep(.el-color-picker__trigger) {
  width: 2rem;
  height: 2rem;
  padding: 0.125rem;
  border: 1px solid var(--config-group-border);
  border-radius: var(--config-radius-sm);
}

.config-field-hint {
  margin: 0.375rem 0 0;
  font-size: 0.75rem;
  color: var(--app-text-muted);
  line-height: 1.4;
}
</style>
