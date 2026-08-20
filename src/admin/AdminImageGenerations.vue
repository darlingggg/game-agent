<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Picture, Refresh, Search, View, Warning } from '@element-plus/icons-vue'
import {
  getAdminImageGeneration,
  getAdminImageGenerations,
  type AdminImageGeneration,
  type AdminImageGenerationOrigin,
  type AdminImageGenerationStatus,
} from '@/http/admin'

defineOptions({ name: 'AdminImageGenerations' })

const PAGE_SIZE = 20
const loading = ref(false)
const detailLoading = ref(false)
const rows = ref<AdminImageGeneration[]>([])
const page = ref(1)
const total = ref(0)
const selected = ref<AdminImageGeneration | null>(null)
const detailVisible = ref(false)
const dateRange = ref<[string, string] | null>(null)
const summary = reactive({ total: 0, succeeded: 0, failed: 0, processing: 0, storedBytes: 0 })
const filters = reactive<{
  keyword: string
  account: string
  projectId: string
  status: '' | AdminImageGenerationStatus
  origin: '' | AdminImageGenerationOrigin
}>({ keyword: '', account: '', projectId: '', status: '', origin: '' })

const successRate = computed(() => summary.total ? Math.round(summary.succeeded / summary.total * 100) : 0)

const STATUS_LABELS: Record<AdminImageGenerationStatus, string> = {
  queued: '等待中',
  submitted: '已提交',
  generating: '生成中',
  storing: '存储中',
  succeeded: '成功',
  failed: '失败',
}

function formatBytes(value: number | null | undefined) {
  if (!value) return '0 B'
  if (value < 1024) return value + ' B'
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB'
  return (value / 1024 / 1024).toFixed(2) + ' MB'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(row: AdminImageGeneration) {
  if (!row.completedAt) return '进行中'
  const seconds = Math.max(0, Math.round((new Date(row.completedAt).getTime() - new Date(row.createdAt).getTime()) / 1000))
  if (seconds < 60) return seconds + ' 秒'
  return Math.floor(seconds / 60) + ' 分 ' + seconds % 60 + ' 秒'
}

function originLabel(origin: AdminImageGenerationOrigin) {
  return origin === 'agent_tool' ? '主 AI 工具' : '图像工作台'
}

async function load(nextPage = page.value) {
  if (loading.value) return
  loading.value = true
  try {
    const projectId = Number(filters.projectId)
    const result = await getAdminImageGenerations({
      page: nextPage,
      pageSize: PAGE_SIZE,
      keyword: filters.keyword.trim() || undefined,
      account: filters.account.trim() || undefined,
      projectId: Number.isInteger(projectId) && projectId > 0 ? projectId : undefined,
      status: filters.status || undefined,
      origin: filters.origin || undefined,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
    })
    rows.value = result.list
    page.value = nextPage
    total.value = result.pagination.total ?? 0
    Object.assign(summary, result.summary)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  Object.assign(filters, { keyword: '', account: '', projectId: '', status: '', origin: '' })
  dateRange.value = null
  void load(1)
}

async function openDetail(row: AdminImageGeneration) {
  selected.value = row
  detailVisible.value = true
  detailLoading.value = true
  try {
    selected.value = await getAdminImageGeneration(row.id)
  } finally {
    detailLoading.value = false
  }
}

defineExpose({ refresh: () => load(), loading })
onMounted(() => void load(1))
</script>

<template>
  <div class="image-admin">
    <section class="image-admin__metrics" aria-label="AI 生图统计">
      <article><span>任务总数</span><strong>{{ summary.total }}</strong><small>当前筛选范围</small></article>
      <article><span>处理中</span><strong>{{ summary.processing }}</strong><small>生成与 COS 入库</small></article>
      <article><span>成功率</span><strong>{{ successRate }}%</strong><small>{{ summary.succeeded }} 成功 / {{ summary.failed
          }} 失败</small></article>
      <article class="is-accent"><span>入库体积</span><strong>{{ formatBytes(summary.storedBytes) }}</strong><small>WebP
          持久化总量</small></article>
    </section>

    <section class="image-admin__dataset" aria-labelledby="image-generations-title">
      <header class="image-admin__header">
        <div>
          <p>AI / IMAGE OPERATIONS</p>
          <h2 id="image-generations-title">生图任务</h2>
        </div>
        <button type="button" :disabled="loading" aria-label="刷新任务" @click="load()">
          <Refresh :class="{ spinning: loading }" />
        </button>
      </header>

      <div class="image-admin__filters">
        <el-input v-model="filters.keyword" clearable :prefix-icon="Search" placeholder="提示词、任务 ID 或工具调用 ID"
          @keyup.enter="load(1)" />
        <el-input v-model="filters.account" clearable placeholder="用户账号" @keyup.enter="load(1)" />
        <el-input v-model="filters.projectId" clearable inputmode="numeric" placeholder="项目 ID"
          @keyup.enter="load(1)" />
        <el-select v-model="filters.origin" clearable placeholder="全部来源">
          <el-option label="主 AI 工具" value="agent_tool" />
          <el-option label="图像工作台" value="image_lab" />
        </el-select>
        <el-select v-model="filters.status" clearable placeholder="全部状态">
          <el-option v-for="(label, value) in STATUS_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至"
          start-placeholder="开始日期" end-placeholder="结束日期" />
        <button class="image-admin__search" type="button" @click="load(1)">查询</button>
        <button class="image-admin__reset" type="button" @click="resetFilters">重置</button>
      </div>

      <div class="image-admin__table">
        <el-table v-loading="loading" :data="rows" row-key="id" @row-click="openDetail">
          <el-table-column label="图片" width="92">
            <template #default="{ row }">
              <div class="task-thumb">
                <img v-if="row.url" :src="row.url" alt="AI 生成图片" loading="lazy" crossorigin="anonymous"
                  referrerpolicy="no-referrer" />
                <Picture v-else />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="任务" min-width="270">
            <template #default="{ row }">
              <div class="task-main"><strong>#{{ row.id }} · {{ originLabel(row.origin) }}</strong>
                <p>{{ row.prompt }}</p><small>{{ row.model }} · {{ row.imageSize }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="用户 / 项目" min-width="180">
            <template #default="{ row }">
              <div class="task-owner"><strong>{{ row.userNickname || row.account }}</strong><span>@{{ row.account
                  }}</span><small>{{ row.projectTitle || (row.projectId ? '项目 #' + row.projectId : '未关联项目') }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }"><span class="task-status" :class="'is-' + row.status"><i />{{
              STATUS_LABELS[row.status as AdminImageGenerationStatus] }}</span></template>
          </el-table-column>
          <el-table-column label="存储" width="145">
            <template #default="{ row }">
              <div class="task-storage"><strong>{{ formatBytes(row.storedSize) }}</strong><small
                  v-if="row.originalSize">原始 {{ formatBytes(row.originalSize) }}</small><small v-else>等待入库</small></div>
            </template>
          </el-table-column>
          <el-table-column label="耗时 / 创建时间" width="190">
            <template #default="{ row }">
              <div class="task-time"><strong>{{ formatDuration(row) }}</strong><small>{{ formatDate(row.createdAt)
                  }}</small></div>
            </template>
          </el-table-column>
          <el-table-column width="60" align="right">
            <template #default="{ row }"><button class="task-view" type="button" aria-label="查看任务详情"
                @click.stop="openDetail(row)">
                <View />
              </button></template>
          </el-table-column>
          <template #empty>
            <div class="image-admin__empty">没有符合条件的生图任务</div>
          </template>
        </el-table>
      </div>

      <el-pagination v-if="total > PAGE_SIZE" v-model:current-page="page" :page-size="PAGE_SIZE"
        layout="prev, pager, next" :total="total" @current-change="load" />
    </section>

    <el-drawer v-model="detailVisible" class="image-task-drawer" size="min(42rem, 100%)" destroy-on-close>
      <template #header>
        <div class="drawer-heading"><span>生图任务详情</span><small v-if="selected">TASK #{{ selected.id }}</small></div>
      </template>
      <div v-loading="detailLoading" class="task-detail">
        <template v-if="selected">
          <div class="task-detail__preview">
            <el-image v-if="selected.url" :src="selected.url" :preview-src-list="[selected.url]" fit="contain"
              crossorigin="anonymous" preview-teleported />
            <div v-else>
              <Warning v-if="selected.status === 'failed'" />
              <Picture v-else /><span>{{ STATUS_LABELS[selected.status] }}</span>
            </div>
          </div>
          <div class="task-detail__headline"><span class="task-status" :class="'is-' + selected.status"><i />{{
            STATUS_LABELS[selected.status] }}</span><strong>{{ originLabel(selected.origin) }}</strong><small>{{
                formatDuration(selected) }}</small></div>
          <section>
            <h3>提示词</h3>
            <p>{{ selected.prompt }}</p>
          </section>
          <section v-if="selected.negativePrompt">
            <h3>排除内容</h3>
            <p>{{ selected.negativePrompt }}</p>
          </section>
          <section v-if="selected.errorMessage" class="is-error">
            <h3>失败原因</h3>
            <p>{{ selected.errorMessage }}</p>
          </section>
          <section v-if="selected.referenceImages.length">
            <h3>关联图片</h3>
            <div class="reference-images"><a v-for="url in selected.referenceImages" :key="url" :href="url"
                target="_blank" rel="noopener"><img :src="url" alt="关联图片" crossorigin="anonymous" /></a></div>
          </section>
          <dl>
            <div>
              <dt>用户</dt>
              <dd>{{ selected.userNickname || '—' }} / {{ selected.account }}</dd>
            </div>
            <div>
              <dt>项目</dt>
              <dd>{{ selected.projectTitle || '—' }} / {{ selected.projectId || '—' }}</dd>
            </div>
            <div>
              <dt>会话</dt>
              <dd>{{ selected.conversationTitle || '—' }} / {{ selected.conversationId || '—' }}</dd>
            </div>
            <div>
              <dt>Assistant session</dt>
              <dd>{{ selected.assistantSessionId || '—' }}</dd>
            </div>
            <div>
              <dt>Tool call</dt>
              <dd>{{ selected.toolCallId || '—' }}</dd>
            </div>
            <div>
              <dt>服务商任务</dt>
              <dd>{{ selected.externalTaskId || '—' }}</dd>
            </div>
            <div>
              <dt>模型 / 尺寸</dt>
              <dd>{{ selected.model }} / {{ selected.imageSize }}</dd>
            </div>
            <div>
              <dt>实际尺寸</dt>
              <dd>{{ selected.width && selected.height ? selected.width + ' x ' + selected.height : '—' }}</dd>
            </div>
            <div>
              <dt>体积</dt>
              <dd>{{ formatBytes(selected.originalSize) }} → {{ formatBytes(selected.storedSize) }}</dd>
            </div>
            <div>
              <dt>COS 对象键</dt>
              <dd>{{ selected.objectKey || '—' }}</dd>
            </div>
            <div>
              <dt>创建 / 完成</dt>
              <dd>{{ formatDate(selected.createdAt) }} / {{ formatDate(selected.completedAt) }}</dd>
            </div>
          </dl>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.image-admin {
  display: grid;
  min-width: 0;
  max-width: 100%;
  gap: 18px;
}

.image-admin__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--brand-border);
  background: var(--admin-panel);
}

.image-admin__metrics article {
  display: flex;
  min-width: 0;
  min-height: 112px;
  flex-direction: column;
  justify-content: center;
  padding: 18px 20px;
  border-right: 1px solid var(--brand-border);
}

.image-admin__metrics article:last-child {
  border-right: 0;
}

.image-admin__metrics span,
.image-admin__metrics small {
  color: var(--brand-muted);
  font-size: 12px;
}

.image-admin__metrics strong {
  margin: 4px 0;
  color: var(--brand-ink);
  font-family: var(--brand-font-display);
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.1;
}

.image-admin__metrics .is-accent {
  box-shadow: inset 0 3px #42d3a2;
  background: color-mix(in srgb, #42d3a2 6%, var(--admin-panel));
}

.image-admin__dataset {
  min-width: 0;
  max-width: 100%;
  border: 1px solid var(--brand-border);
  background: var(--admin-panel);
}

.image-admin__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 84px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--brand-border);
}

.image-admin__header p {
  margin: 0 0 3px;
  color: #347d67;
  font-family: var(--brand-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.image-admin__header h2 {
  margin: 0;
  color: var(--brand-ink);
  font-family: var(--brand-font-display);
  font-size: 21px;
}

.image-admin__header button,
.task-view {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--brand-border);
  border-radius: 4px;
  background: transparent;
  color: var(--brand-ink);
  cursor: pointer;
}

.image-admin__header svg,
.task-view svg {
  width: 16px;
}

.image-admin__filters {
  display: grid;
  grid-template-columns: minmax(210px, 1.5fr) repeat(4, minmax(120px, .7fr)) minmax(250px, 1fr) auto auto;
  gap: 9px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--brand-border);
}

.image-admin__filters>* {
  min-width: 0;
}

.image-admin__filters :deep(.el-date-editor) {
  width: 100%;
}

.image-admin__filters :deep(.el-input__wrapper),
.image-admin__filters :deep(.el-select__wrapper),
.image-admin__filters :deep(.el-range-editor) {
  min-height: 36px;
  border-radius: 3px;
  box-shadow: 0 0 0 1px var(--brand-border) inset;
}

.image-admin__search,
.image-admin__reset {
  min-height: 36px;
  padding: 0 15px;
  border: 1px solid var(--brand-ink);
  border-radius: 3px;
  background: var(--brand-ink);
  color: var(--brand-canvas);
  font-weight: 700;
  cursor: pointer;
}

.image-admin__reset {
  border-color: var(--brand-border);
  background: transparent;
  color: var(--brand-ink);
}

.image-admin__table {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
}

.image-admin__table :deep(.el-table) {
  min-width: 1040px;
  --el-table-border-color: var(--brand-border);
  --el-table-header-bg-color: color-mix(in srgb, var(--brand-ink) 4%, var(--admin-panel));
  --el-table-row-hover-bg-color: color-mix(in srgb, #42d3a2 7%, var(--admin-panel));
  background: transparent;
}

.image-admin__table :deep(.el-table__cell) {
  padding: 10px 0;
}

.task-thumb {
  display: grid;
  width: 64px;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--brand-border);
  border-radius: 4px;
  background: var(--brand-canvas);
  color: var(--brand-muted);
}

.task-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.task-thumb svg {
  width: 22px;
}

.task-main,
.task-owner,
.task-storage,
.task-time {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.task-main strong,
.task-owner strong,
.task-storage strong,
.task-time strong {
  color: var(--brand-ink);
  font-size: 13px;
}

.task-main p {
  display: -webkit-box;
  overflow: hidden;
  margin: 2px 0;
  color: var(--brand-ink);
  font-size: 13px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.task-main small,
.task-owner span,
.task-owner small,
.task-storage small,
.task-time small {
  color: var(--brand-muted);
  font-size: 11px;
}

.task-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 4px 7px;
  border: 1px solid var(--brand-border);
  border-radius: 3px;
  color: var(--brand-ink);
  font-size: 11px;
  font-weight: 700;
}

.task-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e6a23c;
}

.task-status.is-succeeded i {
  background: #20a474;
}

.task-status.is-failed i {
  background: #d94a4a;
}

.image-admin__empty {
  padding: 50px;
  color: var(--brand-muted);
  font-size: 13px;
}

.image-admin__dataset :deep(.el-pagination) {
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid var(--brand-border);
}

.drawer-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drawer-heading span {
  font-family: var(--brand-font-display);
  font-size: 18px;
  font-weight: 800;
}

.drawer-heading small {
  color: var(--brand-muted);
  font-family: var(--brand-font-mono);
  font-size: 11px;
}

.task-detail {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.task-detail__preview {
  display: grid;
  min-height: 280px;
  max-height: 480px;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--brand-border);
  background: var(--brand-canvas);
}

.task-detail__preview :deep(.el-image) {
  width: 100%;
  height: 100%;
  min-height: 280px;
}

.task-detail__preview>div {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--brand-muted);
}

.task-detail__preview svg {
  width: 30px;
}

.task-detail__headline {
  display: flex;
  align-items: center;
  gap: 10px;
}

.task-detail__headline strong {
  font-size: 13px;
}

.task-detail__headline small {
  margin-left: auto;
  color: var(--brand-muted);
  font-size: 12px;
}

.task-detail section {
  padding: 13px 15px;
  border-left: 3px solid #42d3a2;
  background: color-mix(in srgb, #42d3a2 5%, var(--admin-panel));
}

.task-detail section.is-error {
  border-left-color: #d94a4a;
  background: color-mix(in srgb, #d94a4a 5%, var(--admin-panel));
}

.task-detail h3 {
  margin: 0 0 5px;
  color: var(--brand-muted);
  font-size: 11px;
}

.task-detail p {
  margin: 0;
  color: var(--brand-ink);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.reference-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reference-images img {
  display: block;
  width: 72px;
  height: 72px;
  object-fit: cover;
  border: 1px solid var(--brand-border);
  border-radius: 3px;
}

.task-detail dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0;
  border-top: 1px solid var(--brand-border);
  border-left: 1px solid var(--brand-border);
}

.task-detail dl div {
  min-width: 0;
  padding: 10px 12px;
  border-right: 1px solid var(--brand-border);
  border-bottom: 1px solid var(--brand-border);
}

.task-detail dt {
  margin-bottom: 3px;
  color: var(--brand-muted);
  font-size: 11px;
}

.task-detail dd {
  overflow-wrap: anywhere;
  margin: 0;
  color: var(--brand-ink);
  font-family: var(--brand-font-mono);
  font-size: 12px;
  line-height: 1.5;
}

.spinning {
  animation: image-admin-spin .8s linear infinite;
}

@keyframes image-admin-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1200px) {
  .image-admin__metrics {
    grid-template-columns: 1fr 1fr;
  }

  .image-admin__metrics article:nth-child(2) {
    border-right: 0;
  }

  .image-admin__metrics article:nth-child(-n+2) {
    border-bottom: 1px solid var(--brand-border);
  }

  .image-admin__filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .image-admin__metrics {
    grid-template-columns: 1fr 1fr;
  }

  .image-admin__metrics article:nth-child(2) {
    border-right: 0;
  }

  .image-admin__metrics article:nth-child(-n+2) {
    border-bottom: 1px solid var(--brand-border);
  }

  .image-admin__filters {
    grid-template-columns: 1fr;
  }

  .task-detail dl {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}
</style>
