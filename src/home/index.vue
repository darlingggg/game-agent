<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createProject, getProjectList, deleteProject, type projectItem, type ProjectType } from '@/http/project'
import { getUserInfo, type UpdateUserProfileResponse } from '@/http/user'
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
const userAvatar = ref('')

type ProjectFilter = 'all' | ProjectType

/** 当前项目类型筛选 */
const activeType = ref<ProjectFilter>('all')

/** 项目类型筛选项 */
const projectFilters: Array<{ value: ProjectFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'tool', label: '工具' },
  { value: '2d', label: '2D 游戏' },
  { value: '3d', label: '3D 游戏' },
]

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
const totalProjectCount = computed(() => projects.value.length)

/** 当前筛选结果数量 */
const projectCount = computed(() => displayedProjects.value.length)

/** 是否存在搜索或类型筛选 */
const hasActiveFilters = computed(() => !!searchKeyword.value.trim() || activeType.value !== 'all')

/** 按标题模糊匹配后的项目列表 */
const displayedProjects = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return projects.value.filter((project) => {
    const matchesKeyword = !keyword || project.title.toLowerCase().includes(keyword)
    const matchesType = activeType.value === 'all' || resolveProjectType(project.type) === activeType.value
    return matchesKeyword && matchesType
  })
})

/** 获取各类型项目数量 */
function getFilterCount(type: ProjectFilter) {
  if (type === 'all') return totalProjectCount.value
  return projects.value.filter((project) => resolveProjectType(project.type) === type).length
}

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
  activeType.value = 'all'
}

/**
 * 格式化项目创建时间
 * @param value 接口返回的时间字符串
 */
function formatProjectTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('/', '.')
}

/** 项目编号展示 */
function formatProjectId(id: number) {
  return String(id).padStart(3, '0')
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
  const project = projects.value.find((item) => item.id === id)
  ElMessageBox.confirm(`删除后无法恢复${project ? `“${project.title}”` : '该项目'}，是否继续？`, '删除项目', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
    lockScroll: false,
  })
    .then(async () => {
      await deleteProject({ id })
      ElMessage.success('项目删除成功')
      await fetchProjectList()
    })
    .catch(() => {})
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

function handleProfileUpdated(profile: UpdateUserProfileResponse) {
  nickName.value = profile.nickname
  userAvatar.value = profile.avatar?.trim() ?? ''
}

onMounted(async () => {
  try {
    const res = await getUserInfo()
    nickName.value = res.nickname
    userAvatar.value = res.avatar?.trim() ?? ''
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
  <div class="home-page">
    <header class="home-header">
      <div class="home-header-inner">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">
            <span class="brand-mark-svg" />
          </span>
          <div class="brand-copy">
            <strong>AI Agent</strong>
            <span>Project workspace</span>
          </div>
        </div>

        <div class="header-actions">
          <ThemeToggle />
          <UserMenu :nickname="nickName" :avatar="userAvatar" @profile-updated="handleProfileUpdated" />
        </div>
      </div>
    </header>

    <main class="home-main">
      <section class="workspace-heading" aria-labelledby="workspace-title">
        <div>
          <p class="workspace-kicker">Workspace / {{ totalProjectCount }} projects</p>
          <h1 id="workspace-title">{{ nickName ? `${nickName} 的项目` : '项目工作台' }}</h1>
        </div>
        <button type="button" class="create-project-button" @click="openCreateDialog">
          <SvgIcon name="plus" />
          <span>新建项目</span>
        </button>
      </section>

      <section class="project-index" aria-labelledby="project-index-title">
        <header class="project-index-header">
          <div>
            <span class="section-index">01 / PROJECT INDEX</span>
            <h2 id="project-index-title">项目索引</h2>
          </div>
          <div class="project-result-count" aria-live="polite">
            <strong>{{ projectCount }}</strong>
            <span>{{ hasActiveFilters ? '项结果' : '个项目' }}</span>
          </div>
        </header>

        <div class="project-toolbar">
          <el-input v-model="searchInput" class="project-search" placeholder="搜索项目名称" :prefix-icon="Search" clearable @input="handleSearchInput" />

          <div class="project-filter" role="group" aria-label="按项目类型筛选">
            <button
              v-for="filter in projectFilters"
              :key="filter.value"
              type="button"
              class="project-filter-option"
              :class="{ 'project-filter-option--active': activeType === filter.value }"
              :aria-pressed="activeType === filter.value"
              @click="activeType = filter.value"
            >
              <span>{{ filter.label }}</span>
              <small>{{ getFilterCount(filter.value) }}</small>
            </button>
          </div>
        </div>

        <div v-loading="listLoading" class="project-results">
          <div v-if="displayedProjects.length" class="project-grid">
            <article v-for="project in displayedProjects" :key="project.id" class="project-card" :class="PROJECT_TYPE_CLASS[resolveProjectType(project.type)]">
              <button type="button" class="project-card-hitarea" :aria-label="`进入项目 ${project.title}`" @click="handleEnterProject(project)" />

              <div class="project-card-visual" aria-hidden="true">
                <span class="project-card-number">#{{ formatProjectId(project.id) }}</span>
                <div class="project-card-orbit" />
                <div class="project-card-icon">
                  <SvgIcon :name="`project-${resolveProjectType(project.type)}`" />
                </div>
                <span class="project-type-badge">{{ PROJECT_TYPE_LABEL[resolveProjectType(project.type)] }}</span>
              </div>

              <div class="project-card-actions">
                <el-button class="card-action-button" :icon="Edit" circle title="编辑项目" aria-label="编辑项目" @click.stop="handleEditPro(project.id)" />
                <el-button
                  class="card-action-button card-action-button--danger"
                  :icon="Delete"
                  circle
                  title="删除项目"
                  aria-label="删除项目"
                  @click.stop="handleDeletePro(project.id)"
                />
              </div>

              <div class="project-card-content">
                <h3>{{ project.title }}</h3>
                <p>{{ getProjectDesc(project.desc) }}</p>
                <footer>
                  <time :datetime="project.createdAt" :title="new Date(project.createdAt).toLocaleString('zh-CN', { hour12: false })">
                    <SvgIcon name="calendar" />
                    {{ formatProjectTime(project.createdAt) }}
                  </time>
                  <span class="project-card-enter">打开项目 <b>↗</b></span>
                </footer>
              </div>
            </article>
          </div>

          <div v-else-if="!listLoading" class="project-empty">
            <span class="project-empty-icon"><Search /></span>
            <h3>{{ hasActiveFilters ? '没有匹配的项目' : '还没有项目' }}</h3>
            <p>{{ hasActiveFilters ? '换个名称或项目类型试试。' : '从第一个项目开始。' }}</p>
            <button v-if="hasActiveFilters" type="button" class="empty-action-button" @click="handleResetSearch">查看全部项目</button>
            <button v-else type="button" class="empty-action-button" @click="openCreateDialog">新建项目</button>
          </div>
        </div>
      </section>
    </main>

    <el-dialog v-model="createDialogVisible" class="project-dialog" title="新建项目" width="30rem" :lock-scroll="false" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="项目名称" prop="title">
          <el-input v-model="createForm.title" placeholder="例如：像素冒险" maxlength="20" show-word-limit clearable />
        </el-form-item>
        <el-form-item label="项目类型" prop="type">
          <el-radio-group v-model="createForm.type" class="project-type-picker">
            <el-radio-button v-for="type in ['tool', '2d', '3d'] as ProjectType[]" :key="type" :value="type">
              <SvgIcon :name="`project-${type}`" />
              <span>{{ PROJECT_TYPE_LABEL[type] }}</span>
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="createForm.desc" type="textarea" :rows="3" placeholder="简单记录项目目标（选填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateProject">创建项目</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" class="project-dialog" title="项目配置" width="30rem" :lock-scroll="false" destroy-on-close>
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-position="top">
        <el-form-item label="项目名称" prop="title">
          <el-input v-model="editForm.title" placeholder="请输入项目名称" maxlength="20" show-word-limit clearable />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="editForm.desc" type="textarea" :rows="3" placeholder="简单记录项目目标（选填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="editing" @click="handleUpdateProject">保存配置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped src="./home.css"></style>
