<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Cpu, Refresh, Search, Star, StarFilled, Timer } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { effortLabel, getAdminModels, setAdminDefaultModel, setAdminModelAvailability, syncAdminModels, type AdminModelsData, type AiModel } from '@/http/models'
import AdminHelp from './AdminHelp.vue'

const data = ref<AdminModelsData | null>(null)
const loading = ref(false)
const syncing = ref(false)
const saving = ref('')
const query = ref('')
const filter = ref('all')
let polling: ReturnType<typeof setInterval> | undefined
let refreshTask: Promise<void> | null = null
const busy = computed(() => !!saving.value || syncing.value || !!data.value?.sync.running)
const available = computed(() => data.value?.list.filter((model) => model.enabled).length || 0)
const defaultModel = computed(() => data.value?.list.find((model) => model.isDefault))
const models = computed(() =>
  (data.value?.list || []).filter((model) => {
    const keyword = query.value.trim().toLowerCase()
    return (
      (!keyword || `${model.modelName} ${model.modelKey}`.toLowerCase().includes(keyword)) &&
      (filter.value === 'all' || (filter.value === 'enabled' ? !!model.enabled : !model.enabled))
    )
  }),
)
async function refresh(silent = false) {
  if (refreshTask) {
    await refreshTask
    return refresh(silent)
  }
  if (!silent) loading.value = true
  refreshTask = getAdminModels()
    .then((result) => {
      data.value = result
    })
    .catch(() => {
      /* 请求层提示错误 */
    })
    .finally(() => {
      loading.value = false
      refreshTask = null
    })
  await refreshTask
}
async function setDefault(model: AiModel) {
  if (busy.value || !model.enabled || model.isDefault) return
  saving.value = model.modelKey
  try {
    await setAdminDefaultModel(model.modelKey)
    ElMessage.success('默认模型已更新')
  } catch {
    /* 请求层提示错误 */
  } finally {
    await refresh(true)
    saving.value = ''
  }
}
async function toggleModel(model: AiModel) {
  if (busy.value) return
  saving.value = model.modelKey
  try {
    const result = await setAdminModelAvailability(model.modelKey, !model.enabled)
    ElMessage.success(result.enabled ? '模型已启用' : model.isDefault ? '模型已禁用，默认模型已自动调整' : '模型已禁用')
  } catch {
    /* 失败后读取服务端状态 */
  } finally {
    await refresh(true)
    saving.value = ''
  }
}
async function sync() {
  if (busy.value) return
  syncing.value = true
  try {
    const result = await syncAdminModels()
    if (result.skipped) ElMessage.info(result.reason || '已有模型同步任务正在运行')
    else ElMessage.success(`已同步 ${result.synced} 个模型，人工禁用设置已保留`)
  } catch {
    /* 请求层提示错误 */
  } finally {
    await refresh(true)
    syncing.value = false
  }
}
const formatTime = (value?: string | null) => (value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—')
const statusLabel = (model: AiModel) => (model.enabled ? '可用' : model.manualDisabled ? '人工禁用' : '服务商下线')
function refreshOnFocus() {
  if (!busy.value) void refresh(true)
}
onMounted(() => {
  void refresh()
  polling = setInterval(() => {
    if (!document.hidden && !saving.value && !syncing.value) void refresh(true)
  }, 15000)
  window.addEventListener('focus', refreshOnFocus)
})
onBeforeUnmount(() => {
  clearInterval(polling)
  window.removeEventListener('focus', refreshOnFocus)
})
defineExpose({ refresh })
</script>

<template>
  <section class="models-dataset" aria-labelledby="models-title" v-loading="loading">
    <div class="models-summary">
      <article>
        <span
          ><el-icon><Cpu /></el-icon>可用模型</span
        ><strong
          >{{ available }}<small>/ {{ data?.list.length || 0 }}</small></strong
        >
      </article>
      <article>
        <span
          ><el-icon><StarFilled /></el-icon>默认模型</span
        ><strong class="default-model-name">{{ defaultModel?.modelName || '暂无可用模型' }}</strong>
      </article>
      <article>
        <span
          ><el-icon><Timer /></el-icon>下次自动同步</span
        ><strong class="sync-time">{{ formatTime(data?.nextSyncAt) }}</strong>
      </article>
    </div>
    <div class="models-panel">
      <header class="models-header">
        <div>
          <h2 id="models-title">
            模型目录
            <AdminHelp
              label="模型目录说明"
              text="每天北京时间 04:00 自动同步；人工禁用会持续保留。禁用默认模型后自动选择其他可用模型。星标表示默认模型。页面每 15 秒刷新状态，返回窗口时立即刷新。"
            />
          </h2>
          <p>管理模型可用性，为新会话选择默认模型。</p>
        </div>
        <el-tooltip content="同步服务商模型目录" placement="top"
          ><button class="model-sync-button" type="button" :disabled="busy" aria-label="同步模型目录" @click="sync">
            <el-icon :class="{ spinning: syncing || data?.sync.running }"><Refresh /></el-icon><span>{{ syncing || data?.sync.running ? '同步中' : '同步目录' }}</span>
          </button></el-tooltip
        >
      </header>
      <div class="models-toolbar">
        <el-input v-model="query" :prefix-icon="Search" placeholder="搜索模型名称或标识" clearable aria-label="搜索模型" />
        <div class="models-filters" aria-label="模型状态筛选">
          <button
            v-for="item in [
              { value: 'all', label: '全部' },
              { value: 'enabled', label: '可用' },
              { value: 'disabled', label: '不可用' },
            ]"
            :key="item.value"
            type="button"
            :class="{ active: filter === item.value }"
            :aria-pressed="filter === item.value"
            @click="filter = item.value"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <el-table :data="models" row-key="modelKey" empty-text="暂无匹配模型" style="width: 100%">
        <el-table-column label="模型" min-width="230"
          ><template #default="{ row }"
            ><div class="model-identity">
              <span class="model-avatar"
                ><el-icon><Cpu /></el-icon
              ></span>
              <div>
                <strong>{{ row.modelName }}</strong
                ><small>{{ row.modelKey }}</small>
              </div>
            </div></template
          ></el-table-column
        >
        <el-table-column label="状态" min-width="130"
          ><template #default="{ row }"
            ><span class="model-status" :class="{ available: row.enabled }"><i />{{ statusLabel(row) }}</span></template
          ></el-table-column
        >
        <el-table-column label="推理强度" min-width="170"
          ><template #default="{ row }"
            ><div class="effort-levels">
              <span v-for="level in row.effort?.supportedLevels || []" :key="level" :class="{ preferred: level === row.effort?.defaultLevel }">{{ effortLabel(level) }}</span
              ><small v-if="!row.effort?.supportedLevels?.length">—</small>
            </div></template
          ></el-table-column
        >
        <el-table-column label="上下文上限" min-width="130"
          ><template #default="{ row }"
            ><span class="model-context">{{ row.capabilities?.contextWindow?.toLocaleString() || '—' }}</span></template
          ></el-table-column
        >
        <el-table-column label="输入类型" min-width="110"
          ><template #default="{ row }"
            ><span class="model-input-types">{{ row.capabilities?.inputModalities?.join(' / ') || '—' }}</span></template
          ></el-table-column
        >
        <el-table-column label="默认" width="70" align="center" fixed="right"
          ><template #default="{ row }"
            ><el-tooltip :content="row.isDefault ? '当前默认模型' : row.enabled ? '设为默认模型' : '启用后可设为默认'" placement="top"
              ><button
                class="model-star"
                :class="{ selected: row.isDefault }"
                type="button"
                :aria-label="`${row.isDefault ? '当前默认模型' : '设为默认模型'}：${row.modelName}`"
                :aria-pressed="!!row.isDefault"
                :disabled="!row.enabled || busy"
                @click="setDefault(row)"
              >
                <el-icon><StarFilled v-if="row.isDefault" /><Star v-else /></el-icon></button></el-tooltip></template
        ></el-table-column>
        <el-table-column label="启用" width="80" align="center" fixed="right"
          ><template #default="{ row }"
            ><el-tooltip :content="row.providerAvailable ? (row.enabled ? '禁用此模型' : '启用此模型') : '服务商下线，无法启用'" placement="top"
              ><button
                class="model-switch"
                :class="{ enabled: row.enabled }"
                type="button"
                role="switch"
                :aria-checked="!!row.enabled"
                :aria-label="`模型可用性：${row.modelName}`"
                :disabled="busy || (!row.providerAvailable && !row.enabled)"
                @click="toggleModel(row)"
              >
                <span /></button></el-tooltip></template
        ></el-table-column>
      </el-table>
      <footer class="models-footer">
        <span>{{ models.length }} 个模型 · 最近同步 {{ formatTime(data?.sync.finishedAt) }}</span
        ><span><i />人工设置持续生效</span>
      </footer>
      <p v-if="data?.sync.lastError" class="models-error" role="alert">{{ data.sync.lastError }}</p>
    </div>
  </section>
</template>

<style scoped>
.models-dataset {
  min-width: 0;
}
.models-summary {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}
.models-summary article,
.models-panel {
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: var(--admin-panel);
}
.models-summary article {
  min-width: 0;
  padding: 22px 24px;
}
.models-summary article > span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.models-summary article > span .el-icon {
  color: var(--app-accent);
  font-size: 16px;
}
.models-summary strong {
  display: block;
  margin-top: 14px;
  font-size: 30px;
  font-weight: 600;
}
.models-summary strong small {
  margin-left: 8px;
  font-size: 15px;
  font-weight: 400;
  color: var(--app-text-muted);
}
.models-summary .default-model-name,
.models-summary .sync-time {
  font-size: 18px;
  overflow-wrap: anywhere;
}
.models-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
}
.models-header h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 17px;
}
.models-header p {
  margin: 8px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}
.model-sync-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #389cff;
  border-radius: 9px;
  background: #1686ee;
  color: white;
  cursor: pointer;
  white-space: nowrap;
}
.models-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px 22px;
}
.models-toolbar .el-input {
  max-width: 320px;
}
.models-filters {
  display: flex;
  padding: 3px;
  gap: 3px;
  border: 1px solid var(--app-border);
  border-radius: 9px;
}
.models-filters button {
  padding: 6px 13px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}
.models-filters button.active {
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.model-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.model-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border: 1px solid var(--app-border);
  background: var(--app-bg-subtle);
  color: var(--app-accent);
  border-radius: 10px;
  font-size: 18px;
}
.model-identity strong {
  display: block;
  font-weight: 500;
  color: var(--app-text-primary);
}
.model-identity small {
  display: block;
  font-family: var(--brand-font-mono);
  font-size: 11px;
  color: var(--app-text-muted);
}
.model-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.model-status i,
.models-footer i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.model-status.available {
  color: #6cdbb5;
}
.effort-levels {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.effort-levels span {
  padding: 0 7px;
  border: 1px solid var(--app-border);
  border-radius: 5px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.effort-levels span.preferred {
  border-color: #278bd955;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.model-context {
  font-family: var(--brand-font-mono);
  font-size: 12px;
}
.model-input-types {
  font-size: 12px;
  color: var(--app-text-muted);
}
.model-star {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--app-text-muted);
  font-size: 19px;
  cursor: pointer;
}
.model-star:hover {
  background: var(--app-accent-soft);
}
.model-star.selected {
  color: #ffd582;
  background: #dcb25714;
  border-color: #dcb25725;
}
.model-switch {
  display: inline-flex;
  align-items: center;
  width: 34px;
  height: 20px;
  padding: 3px;
  border: 1px solid #ffffff18;
  border-radius: 20px;
  background: #333d4d;
  cursor: pointer;
  transition: background 0.2s;
}
.model-switch span {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #b8c2d3;
  transition: transform 0.2s;
}
.model-switch.enabled {
  background: #1686ee;
}
.model-switch.enabled span {
  transform: translateX(12px);
  background: white;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.models-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 24px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.models-footer span:last-child {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #6cdbb5;
}
.models-error {
  margin: 0;
  padding: 0 24px 16px;
  color: #ff9292;
  font-size: 12px;
}
.spinning {
  animation: model-spin 1s linear infinite;
}
@keyframes model-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 700px) {
  .models-summary {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .models-summary article {
    padding: 16px;
  }
  .models-toolbar {
    flex-wrap: wrap;
  }
  .models-header {
    padding: 20px 16px;
  }
  .models-toolbar {
    padding-inline: 16px;
  }
}
</style>
