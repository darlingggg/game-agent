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

defineOptions({
  name: 'ConfigPanel',
})

const appearanceStore = useAppearanceStore()
const projectStore = useProjectStore()
const { theme, backgroundColor } = storeToRefs(appearanceStore)

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
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目信息保存失败')
  } finally {
    projectSaving.value = false
  }
}
</script>

<template>
  <div class="config-panel">
    <section class="config-section">
      <h3 class="config-section-title">项目信息</h3>
      <el-form
        v-loading="projectLoading"
        class="config-form"
        label-position="top"
        @submit.prevent="handleSaveProject"
      >
        <el-form-item label="项目名">
          <el-input v-model="projectForm.name" placeholder="请输入项目名称" clearable />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input
            v-model="projectForm.description"
            type="textarea"
            :rows="4"
            placeholder="请输入项目描述（选填）"
            resize="none"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="projectSaving" @click="handleSaveProject">
            保存
          </el-button>
        </el-form-item>
      </el-form>
    </section>

    <el-divider />

    <section class="config-section">
      <h3 class="config-section-title">外观</h3>
      <el-form class="config-form" label-position="top">
        <el-form-item label="默认主题">
          <el-radio-group v-model="theme">
            <el-radio-button value="light">浅色</el-radio-button>
            <el-radio-button value="dark">深色</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="背景色">
          <div class="config-color-row">
            <el-input
              v-model="backgroundColor"
              placeholder="不填使用当前主题默认背景"
              clearable
              @clear="clearBackgroundColor"
            />
            <el-color-picker
              v-model="pickerColor"
              show-alpha
              @change="handleColorChange"
            />
          </div>
        </el-form-item>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.config-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 1.5rem 2rem;
  background-color: var(--app-surface);
}

.config-section {
  max-width: 720px;
}

.config-section-title {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
}

.config-form {
  width: 100%;
}

.config-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: var(--app-text-primary);
}

.config-panel :deep(.el-divider) {
  border-color: var(--app-border);
}

.config-color-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.config-color-row .el-input {
  flex: 1;
}
</style>
