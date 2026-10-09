<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { effortLabel, getAdminModels, setAdminDefaultModel, syncAdminModels, type AdminModelsData } from '@/http/models'
import AdminHelp from './AdminHelp.vue'

const data = ref<AdminModelsData | null>(null)
const loading = ref(false)
const syncing = ref(false)
const savingDefault = ref('')

async function setDefault(model: string) {
  if (savingDefault.value || syncing.value) return
  savingDefault.value = model
  try {
    await setAdminDefaultModel(model)
    ElMessage.success('默认模型已更新，新会话将使用此模型')
  } catch {
    /* 请求层统一提示错误。 */
  } finally {
    savingDefault.value = ''
    await refresh()
  }
}

async function refresh() {
  loading.value = true
  try {
    data.value = await getAdminModels()
  } catch {
    /* 请求层统一提示错误。 */
  } finally {
    loading.value = false
  }
}

async function sync() {
  if (syncing.value) return
  syncing.value = true
  try {
    const result = await syncAdminModels()
    if (result.skipped) ElMessage.info(result.reason || '已有模型同步任务正在运行')
    else ElMessage.success(`同步完成：${result.synced} 个可用模型，${result.disabled} 个模型失效`)
  } catch {
    /* 请求层统一提示错误。 */
  } finally {
    syncing.value = false
    await refresh()
  }
}

const formatTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—')

onMounted(refresh)
defineExpose({ refresh })
</script>

<template>
  <section class="admin-dataset models-dataset" aria-labelledby="models-title" v-loading="loading">
    <div class="dataset-header">
      <div>
        <h2 id="models-title">
          模型目录 <AdminHelp label="模型目录说明" text="每天北京时间凌晨 4 点自动同步。新会话未指定模型时使用默认模型；默认模型失效后会自动选择可用模型。" />
        </h2>
      </div>
      <el-button type="primary" :loading="syncing || data?.sync.running" :disabled="!!savingDefault" @click="sync">同步模型</el-button>
    </div>
    <div class="models-sync-state" role="status">
      <span>下次同步：{{ formatTime(data?.nextSyncAt) }}</span>
      <span>最近完成：{{ formatTime(data?.sync.finishedAt) }}</span>
      <span v-if="data?.sync.running">同步正在运行</span>
      <span v-if="data?.sync.lastError" class="models-error">{{ data.sync.lastError }}</span>
    </div>
    <el-table :data="data?.list || []" empty-text="暂无模型，请点击同步模型" style="width: 100%">
      <el-table-column prop="modelName" label="模型名称" min-width="185" />
      <el-table-column prop="modelKey" label="模型标识" min-width="180" />
      <el-table-column label="默认模型" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.isDefault" type="primary">默认</el-tag>
          <el-button
            v-else
            link
            type="primary"
            :loading="savingDefault === row.modelKey"
            :disabled="!row.enabled || !!savingDefault || syncing || data?.sync.running"
            @click="setDefault(row.modelKey)"
            >设为默认</el-button
          >
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }"
          ><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '可用' : '已失效' }}</el-tag></template
        >
      </el-table-column>
      <el-table-column label="推理强度" min-width="150">
        <template #default="{ row }">{{ row.effort?.supportedLevels?.map(effortLabel).join(' / ') || '—' }}</template>
      </el-table-column>
      <el-table-column label="默认强度" width="110">
        <template #default="{ row }">{{ row.effort?.defaultLevel ? effortLabel(row.effort.defaultLevel) : '—' }}</template>
      </el-table-column>
      <el-table-column label="上下文上限" min-width="135">
        <template #default="{ row }">{{ row.capabilities?.contextWindow?.toLocaleString() || '—' }}</template>
      </el-table-column>
      <el-table-column label="输入类型" min-width="130">
        <template #default="{ row }">{{ row.capabilities?.inputModalities?.join(' / ') || '—' }}</template>
      </el-table-column>
    </el-table>
  </section>
</template>

<style scoped>
.models-dataset {
  min-width: 0;
}
.dataset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.dataset-header h2 {
  margin: 0;
  font-size: 19px;
}
.models-sync-state {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 16px 24px;
  color: var(--app-text-secondary);
  font-size: 13px;
}
.models-error {
  color: var(--el-color-danger);
}
@media (max-width: 640px) {
  .dataset-header {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 16px;
  }
}
</style>
