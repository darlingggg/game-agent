<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createProject, getProjectList, deleteProject, type projectItem, type ProjectType } from '@/http/project'
import { getUserInfo } from '@/http/user'
import { Delete, Edit, Search } from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project'
import { saveProjectConfig } from '@/utils/projectConfig'
import { PROJECT_TYPE_CLASS, PROJECT_TYPE_LABEL, resolveProjectType } from '@/utils/projectType'
import UserMenu from '@/components/UserMenu.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import SvgIcon from '@/components/SvgIcon.vue'

const projectStore = useProjectStore()

defineOptions({
  name: 'HomeIndex',
})

const router = useRouter()

const nickName = ref('')

/** 项目列表（完整数据） */
const projects = ref<projectItem[]>([])

/** 搜索框输入值 */
const searchInput = ref('')

/** 防抖后的搜索关键词 */
const searchKeyword = ref('')

/** 搜索防抖定时器 */
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

/** 搜索防抖延迟（毫秒） */
const SEARCH_DEBOUNCE_MS = 100

/** 列表加载中 */
const listLoading = ref(false)

/** 新建项目弹窗 */
const createDialogVisible = ref(false)

/** 新建项目提交中 */
const creating = ref(false)

/** 新建项目表单实例 */
const createFormRef = ref<FormInstance>()

/** 新建项目表单 */
const createForm = reactive({
  title: '',
  desc: '',
  type: 'tool' as ProjectType,
})

/** 新建项目校验规则 */
const createRules: FormRules = {
  title: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择项目类型', trigger: 'change' }],
}

/** 编辑项目弹窗 */
const editDialogVisible = ref(false)

/** 编辑项目提交中 */
const editing = ref(false)

/** 编辑项目表单实例 */
const editFormRef = ref<FormInstance>()

/** 编辑项目表单 */
const editForm = reactive({
  id: 0,
  dirPath: '',
  title: '',
  desc: '',
})

/** 编辑项目校验规则 */
const editRules: FormRules = {
  title: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
}

/** 项目总数 */
const projectCount = computed(() => displayedProjects.value.length)

/** 按标题模糊匹配后的项目列表 */
const displayedProjects = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return projects.value
  return projects.value.filter((project) => project.title.toLowerCase().includes(keyword))
})

/**
 * 搜索输入防抖处理
 */
function handleSearchInput() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  searchDebounceTimer = setTimeout(() => {
    searchKeyword.value = searchInput.value
  }, SEARCH_DEBOUNCE_MS)
}

/**
 * 重置搜索条件，显示全部项目
 */
function handleResetSearch() {
  searchInput.value = ''
  searchKeyword.value = ''
  ElMessage({
    message: '已重置搜索条件',
    type: 'warning',
  })
}

/**
 * 格式化项目创建时间
 * @param value 接口返回的时间字符串
 */
function formatProjectTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

/**
 * 获取项目描述展示文案
 * @param desc 项目描述
 */
function getProjectDesc(desc: string) {
  return desc.trim() || '暂无描述'
}

/**
 * 加载项目列表
 */
async function fetchProjectList() {
  listLoading.value = true
  try {
    projects.value = await getProjectList()
    projectStore.setProjectList(projects.value)
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    listLoading.value = false
  }
}

/**
 * 打开新建项目弹窗
 */
function openCreateDialog() {
  createForm.title = ''
  createForm.desc = ''
  createForm.type = 'tool'
  createDialogVisible.value = true
}

/**
 * 提交新建项目
 */
async function handleCreateProject() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return

  creating.value = true
  try {
    await createProject({
      title: createForm.title.trim(),
      desc: createForm.desc.trim(),
      type: createForm.type,
    })
    ElMessage.success('项目创建成功')
    createDialogVisible.value = false
    await fetchProjectList()
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    creating.value = false
  }
}

/** 删除项目 */
async function handleDeletePro(id: number) {
  ElMessageBox.confirm('确定要删除该项目吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      await deleteProject({ id })
      ElMessage.success('项目删除成功')
      await fetchProjectList()
    })
    .catch(() => { })
}

/** 修改项目配置 */
function handleEditPro(id: number) {
  const project = projects.value.find((item) => item.id === id)
  if (!project) return

  editForm.id = project.id
  editForm.dirPath = project.dirPath
  editForm.title = project.title
  editForm.desc = project.desc
  editDialogVisible.value = true
}

/**
 * 提交项目配置修改
 */
async function handleUpdateProject() {
  const valid = await editFormRef.value?.validate().catch(() => false)
  if (!valid) return

  editing.value = true
  try {
    await saveProjectConfig({
      id: editForm.id,
      dirPath: editForm.dirPath,
      title: editForm.title,
      desc: editForm.desc,
    })
    projectStore.patchProject(editForm.id, {
      title: editForm.title.trim(),
      desc: editForm.desc.trim(),
    })
    ElMessage.success('项目配置保存成功')
    editDialogVisible.value = false
    await fetchProjectList()
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    editing.value = false
  }
}

/**
 * 进入项目编辑器
 * @param project 项目信息
 */
function handleEnterProject(project: projectItem) {
  router.push({
    path: '/builder',
    query: {
      projectId: String(project.id),
    },
  })
}

onMounted(async () => {
  try {
    const res = await getUserInfo()
    nickName.value = res.nickname
  } catch {
    // 错误提示由 axios 拦截器统一处理
  }

  await fetchProjectList()
})

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
})
</script>

<template>
  <div class="background">
    <div class="container">
      <header class="header">
        <div class="header-left">
          <div class="icon">
            <span class="icon-svg" aria-hidden="true" />
          </div>
          <div class="title">
            <span>AI Agent</span>
          </div>
        </div>
        <div class="header-actions">
          <ThemeToggle />
          <UserMenu :nickname="nickName" />
        </div>
      </header>
      <main class="main">
        <div class="main-header">
          <h2 class="main-title">项目列表</h2>
          <span class="main-count">{{ projectCount }} 个项目</span>
        </div>

        <div class="main-search">
          <el-input v-model="searchInput" class="main-search-input" placeholder="搜索项目" :prefix-icon="Search" clearable
            @input="handleSearchInput" />
          <el-button type="warning" dashed @click="handleResetSearch">重置</el-button>
        </div>

        <div v-loading="listLoading" class="project-grid">
          <article v-for="project in displayedProjects" :key="project.id" class="project-card"
            :class="PROJECT_TYPE_CLASS[resolveProjectType(project.type)]">
            <div class="project-card-stripe" aria-hidden="true" />
            <el-button class="card-delete" type="danger" :icon="Delete" dashed @click="handleDeletePro(project.id)" />
            <el-button class="card-edit" type="primary" :icon="Edit" dashed @click="handleEditPro(project.id)" />
            <div class="project-card-top">
              <div class="project-card-icon">
                <SvgIcon :name="`project-${resolveProjectType(project.type)}`" />
              </div>
            </div>

            <h3 class="project-card-name">{{ project.title }}</h3>
            <p class="project-card-desc">{{ getProjectDesc(project.desc) }}</p>

            <div class="project-card-footer">
              <div class="project-card-meta">
                <span class="project-type-badge">{{ PROJECT_TYPE_LABEL[resolveProjectType(project.type)] }}</span>
                <div class="project-card-time">
                  <SvgIcon name="calendar" />
                  <span>{{ formatProjectTime(project.createdAt) }}</span>
                </div>
              </div>
              <button type="button" class="project-card-enter" @click="handleEnterProject(project)">进入项目 →</button>
            </div>
          </article>

          <button type="button" class="project-card project-card--create" @click="openCreateDialog">
            <div class="project-create-icon">
              <SvgIcon name="plus" />
            </div>
            <h3 class="project-create-title">新建项目</h3>
            <p class="project-create-desc">创建一个新的创作项目。</p>
          </button>
        </div>
      </main>

      <el-dialog v-model="createDialogVisible" title="新建项目" width="26rem">
        <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
          <el-form-item label="项目名称" prop="title">
            <el-input v-model="createForm.title" placeholder="请输入项目名称" maxlength="20" show-word-limit clearable />
          </el-form-item>
          <el-form-item label="项目类型" prop="type">
            <el-radio-group v-model="createForm.type">
              <el-radio value="tool">通用工具</el-radio>
              <el-radio value="2d">2D游戏</el-radio>
              <el-radio value="3d">3D游戏</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="项目描述">
            <el-input v-model="createForm.desc" type="textarea" :rows="3" placeholder="请输入项目描述（选填）" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="creating" @click="handleCreateProject">创建</el-button>
        </template>
      </el-dialog>
      <el-dialog v-model="editDialogVisible" title="项目配置" width="26rem">
        <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-position="top">
          <el-form-item label="项目名称" prop="title">
            <el-input v-model="editForm.title" placeholder="请输入项目名称" maxlength="20" show-word-limit clearable />
          </el-form-item>
          <el-form-item label="项目描述">
            <el-input v-model="editForm.desc" type="textarea" :rows="3" placeholder="请输入项目描述（选填）" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="editDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="editing" @click="handleUpdateProject">保存</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<style scoped>
.background {
  width: 100%;
  height: 100vh;
  background: radial-gradient(var(--app-bg-gradient-start), var(--app-bg-gradient-end));
}

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 1340px);
  margin: 0 auto;
  height: 100vh;
  padding: 34px;
}

.header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--app-text-primary);
}

.icon {
  width: 2.5rem;
  height: 2.5rem;
}

.icon-svg {
  display: block;
  width: 2.5rem;
  height: 2.5rem;
  background: var(--app-icon-fill);
  mask: url('/svgs/ai-agent.svg') center / contain no-repeat;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.main {
  flex: 1;
  width: 100%;
  min-height: 0;
  margin-top: 2rem;
  overflow-y: auto;
}

.main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.main-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--app-text-primary);
}

.main-count {
  font-size: 0.875rem;
  color: var(--app-text-secondary);
}

.main-search {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.main-search-input {
  flex: 1;
  max-width: 24rem;
}

.main-search-input :deep(.el-input__wrapper) {
  border-radius: 4px;
  border: 1px solid var(--app-border-strong);
  box-shadow: none;
  margin-left: 3px;
  transition: all 0.2s ease;
}

.main-search-input :deep(.el-input__wrapper.is-focus) {
  border: 1px solid var(--app-accent);
  box-shadow: 0 0 0 2px rgba(36, 99, 220, 0.2);
}

.main-search-input :deep(.el-input__prefix .el-icon) {
  color: var(--app-text-muted);
}

.card-delete {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 2rem;
  height: 2rem;
}

.card-edit {
  position: absolute;
  top: 0.5rem;
  right: 3rem;
  width: 2rem;
  height: 2rem;
  background-color: var(--app-surface);
  color: var(--app-text-secondary);
}

.card-delete:hover {
  color: var(--app-danger);
}

.card-edit:hover {
  color: var(--app-text-primary);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 1.25rem;
}

.project-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.25rem;
  padding-left: 1.4rem;
  background-color: var(--app-surface);
  border: 1px solid var(--app-card-border);
  border-radius: 0.35rem;
  box-shadow: 0 3px 5px var(--app-shadow);
  overflow: hidden;
}

.project-card-stripe {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0.28rem;
}

.project-card.project-type--tool .project-card-stripe {
  background: #6366f1;
}

.project-card.project-type--2d .project-card-stripe {
  background: #10b981;
}

.project-card.project-type--3d .project-card-stripe {
  background: #f97316;
}

.project-card.project-type--tool .project-card-icon {
  background: #eef2ff;
  color: #4338ca;
}

.project-card.project-type--2d .project-card-icon {
  background: #ecfdf5;
  color: #047857;
}

.project-card.project-type--3d .project-card-icon {
  background: #fff7ed;
  color: #c2410c;
}

.project-type-badge {
  display: inline-flex;
  padding: 0.1rem 0.45rem;
  border-radius: 5px;
  font-size: 0.75rem;
  font-weight: 600;
}

.project-type--tool .project-type-badge {
  background: #eef2ff;
  color: #4338ca;
  border: 1px solid #c7d2fe;
}

.project-type--2d .project-type-badge {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.project-type--3d .project-type-badge {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.project-card-meta {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-start;
}

.project-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.project-card-icon,
.project-create-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background-color: var(--app-accent-soft);
  color: var(--app-accent);
  transition: background-color 0.2s ease;
}

.project-card-icon svg,
.project-create-icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.project-card-status {
  padding: 0.125rem 0.625rem;
  font-size: 0.75rem;
  color: var(--app-text-secondary);
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background-color: var(--app-surface);
}

.project-card-name,
.project-create-title {
  margin: 0 0 0.375rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--app-text-primary);
}

.project-card-desc,
.project-create-desc {
  margin: 0 0 1.25rem;
  font-size: 0.8125rem;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.project-card-footer {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: auto;
}

.project-card-time {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}

.project-card-time svg {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

.project-card-enter {
  padding: 0;
  border: none;
  background: none;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--app-accent);
  cursor: pointer;
  white-space: nowrap;
  margin-bottom: 0.075rem;
}

.project-card-enter:hover {
  text-decoration: underline;
}

.project-card--create {
  align-items: center;
  justify-content: center;
  min-height: 11rem;
  text-align: center;
  border: 1px dashed var(--app-border-strong);
  background-color: var(--app-surface);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.project-card--create:hover {
  border-color: var(--app-accent);
  background-color: var(--app-surface-hover);
}

.project-card--create:hover .project-create-icon {
  background-color: var(--app-surface);
}

.project-create-icon {
  margin-bottom: 0.875rem;
}

.project-create-desc {
  margin-bottom: 0;
  max-width: 12rem;
}
</style>
