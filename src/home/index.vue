<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createProject, getProjectList, deleteProject, type projectItem, type ProjectType } from '@/http/project'
import { getUserInfo, type UpdateUserProfileResponse } from '@/http/user'
import { ArrowRight, ArrowUp, Delete, Edit, FolderOpened, Grid, Plus, Search, TopRight } from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project'
import { saveProjectConfig } from '@/utils/projectConfig'
import { projectCardHue, saveProjectPrompt, suggestProjectTitle } from '@/utils/projectDraft'
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
const canManage = ref(false)
const creatorPrompt = ref('')
const creatorType = ref<ProjectType>('tool')
const creatorInputRef = ref<HTMLTextAreaElement | null>(null)
const creationPrompt = ref('')
const projectTypeOptions: ProjectType[] = ['tool', '2d', '3d']
type HomeView = 'create' | 'projects'
const activeHomeView = ref<HomeView>('create')
const homeScreenRef = ref<HTMLElement | null>(null)
const viewScroll: Record<HomeView, number> = { create: 0, projects: 0 }
const creatorPlaceholders: Record<ProjectType, string> = {
  tool: '做一个记录灵感的小工具，支持分类和搜索……',
  '2d': '做一个有霓虹灯效果的贪吃蛇游戏……',
  '3d': '做一个可以自由探索的三维世界……',
}

function showHomeView(view: HomeView) {
  if (view === activeHomeView.value) return
  if (homeScreenRef.value) viewScroll[activeHomeView.value] = homeScreenRef.value.scrollTop
  activeHomeView.value = view
}

function restoreHomeView(element: Element) {
  const screen = element as HTMLElement
  screen.scrollTop = viewScroll[activeHomeView.value]
}

function focusCreator() {
  creatorInputRef.value?.focus({ preventScroll: true })
}

function startFromPrompt() {
  const prompt = creatorPrompt.value.trim()
  if (!prompt) return focusCreator()
  creationPrompt.value = prompt
  createForm.title = suggestProjectTitle(prompt)
  createForm.desc = ''
  createForm.type = creatorType.value
  createDialogVisible.value = true
}

function handleCreatorKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault()
    startFromPrompt()
  }
}

/** 光晕只跟随当前卡片的鼠标位置，不运行常驻动画。 */
function handleCardPointerMove(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const card = event.currentTarget as HTMLElement
  const cover = card.querySelector<HTMLElement>('.project-card-visual')
  if (!cover) return
  const rect = cover.getBoundingClientRect()
  const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
  const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
  card.style.setProperty('--spot-x', `${x}%`)
  card.style.setProperty('--spot-y', `${y}%`)
}

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
  title: [{ required: true, whitespace: true, message: '请输入项目名称', trigger: 'blur' }],
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
  creationPrompt.value = ''
  createForm.title = ''
  createForm.desc = ''
  createForm.type = 'tool'
  createDialogVisible.value = true
}

/**
 * 提交新建项目
 */
async function handleCreateProject() {
  if (creating.value) return
  creating.value = true
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) {
    creating.value = false
    return
  }
  try {
    const title = createForm.title.trim()
    const desc = createForm.desc.trim()
    const type = createForm.type
    const prompt = creationPrompt.value
    const { id, dirPath } = await createProject({
      title,
      desc,
      type,
    })
    ElMessage.success('项目创建成功')
    createDialogVisible.value = false
    if (prompt) {
      const project: projectItem = {
        id,
        dirPath,
        title,
        desc,
        type,
        account: '',
        link: '',
        currentVersion: '',
        createdAt: new Date().toISOString(),
      }
      projectStore.setProjectList([...projects.value, project])
      saveProjectPrompt(id, prompt)
      await router.push({ path: '/builder', query: { projectId: String(id) } })
    } else {
      await fetchProjectList()
    }
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
  canManage.value = profile.role === 'admin' || profile.role === 'super'
}

onMounted(async () => {
  try {
    const res = await getUserInfo()
    nickName.value = res.nickname
    userAvatar.value = res.avatar?.trim() ?? ''
    canManage.value = res.role === 'admin' || res.role === 'super'
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
            <span>项目工作台</span>
          </div>
        </div>

        <div class="header-actions">
          <ThemeToggle />
          <UserMenu :nickname="nickName" :avatar="userAvatar" @profile-updated="handleProfileUpdated" />
        </div>
      </div>
    </header>

    <div class="home-layout">
      <aside class="home-sidebar" aria-label="工作区导航">
        <nav>
          <button
            type="button"
            class="home-nav-item"
            :class="{ 'home-nav-item--active': activeHomeView === 'create' }"
            :aria-current="activeHomeView === 'create' ? 'page' : undefined"
            @click="showHomeView('create')"
          >
            <SvgIcon name="creative-orbit" /><span>新建项目</span>
          </button>
          <button
            type="button"
            class="home-nav-item"
            :class="{ 'home-nav-item--active': activeHomeView === 'projects' }"
            :aria-current="activeHomeView === 'projects' ? 'page' : undefined"
            @click="showHomeView('projects')"
          >
            <el-icon><FolderOpened /></el-icon><span>我的项目</span>
          </button>
          <button v-if="canManage" type="button" class="home-nav-item home-nav-item--admin" aria-label="管理后台" @click="router.push('/admin')">
            <el-icon><Grid /></el-icon><span>管理后台</span>
          </button>
        </nav>
        <div class="home-sidebar-foot">{{ nickName ? `${nickName} 的工作区` : '我的工作区' }}</div>
      </aside>
      <main class="home-main">
        <Transition name="home-view" mode="out-in" @enter="restoreHomeView">
          <div :key="activeHomeView" ref="homeScreenRef" class="home-screen" :class="`home-screen--${activeHomeView}`">
            <section v-if="activeHomeView === 'create'" class="creator-hero" aria-labelledby="creator-title">
              <div class="creator-copy">
                <h1 id="creator-title">今天，想做点什么？</h1>
                <p>用对话，创建你的应用和游戏。</p>
              </div>
              <div class="creator-composer">
                <textarea
                  ref="creatorInputRef"
                  v-model="creatorPrompt"
                  maxlength="4000"
                  rows="3"
                  aria-label="描述你想创建的项目"
                  :placeholder="creatorPlaceholders[creatorType]"
                  @keydown="handleCreatorKeydown"
                />
                <div class="creator-composer-footer">
                  <span class="creator-shortcut"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 创建</span>
                  <button type="button" class="creator-submit" :disabled="!creatorPrompt.trim() || creating" @click="startFromPrompt">
                    <span>创建项目</span><el-icon><ArrowUp /></el-icon>
                  </button>
                </div>
              </div>
              <div class="creator-types" role="group" aria-label="选择新项目类型">
                <button
                  v-for="type in projectTypeOptions"
                  :key="type"
                  type="button"
                  :class="[{ 'is-active': creatorType === type }, `creator-type--${type}`]"
                  :aria-pressed="creatorType === type"
                  @click="creatorType = type"
                >
                  <span class="creator-type-icon"><SvgIcon :name="`project-${type}`" /></span>
                  <span>{{ PROJECT_TYPE_LABEL[type] }}</span>
                </button>
              </div>
              <button type="button" class="creator-projects-link" @click="showHomeView('projects')">
                <el-icon><FolderOpened /></el-icon><span>继续已有项目</span><el-icon class="creator-projects-arrow"><ArrowRight /></el-icon>
              </button>
            </section>

            <section v-else class="project-index" aria-labelledby="project-index-title">
              <header class="project-index-header">
                <div>
                  <h1 id="project-index-title">我的项目</h1>
                </div>
                <div class="project-heading-actions">
                  <div class="project-result-count" aria-live="polite">
                    <span>{{ projectCount }} {{ hasActiveFilters ? '项结果' : '个项目' }}</span>
                  </div>
                  <el-tooltip content="新建空白项目" placement="top"
                    ><button type="button" class="create-project-button" aria-label="新建空白项目" @click="openCreateDialog">
                      <el-icon><Plus /></el-icon></button
                  ></el-tooltip>
                </div>
              </header>

              <div class="project-toolbar">
                <el-input
                  v-model="searchInput"
                  class="project-search"
                  aria-label="搜索项目名称"
                  placeholder="搜索项目名称"
                  :prefix-icon="Search"
                  clearable
                  @input="handleSearchInput"
                />

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
                  <article
                    v-for="project in displayedProjects"
                    :key="project.id"
                    class="project-card"
                    :class="PROJECT_TYPE_CLASS[resolveProjectType(project.type)]"
                    :style="{ '--project-hue': projectCardHue(project.id) }"
                    @pointermove="handleCardPointerMove"
                  >
                    <button type="button" class="project-card-hitarea" :aria-label="`进入项目 ${project.title}`" @click="handleEnterProject(project)" />

                    <div class="project-card-visual" aria-hidden="true">
                      <div class="project-card-icon-stack">
                        <div class="project-card-icon">
                          <SvgIcon :name="`project-${resolveProjectType(project.type)}`" />
                        </div>
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
                        <el-icon class="project-card-enter" aria-hidden="true"><TopRight /></el-icon>
                      </footer>
                    </div>
                  </article>
                </div>

                <div v-else-if="!listLoading" class="project-empty">
                  <span class="project-empty-icon"><Search /></span>
                  <h3>{{ hasActiveFilters ? '没有匹配的项目' : '还没有项目' }}</h3>
                  <p>{{ hasActiveFilters ? '换个名称或项目类型试试。' : '从第一个项目开始。' }}</p>
                  <button v-if="hasActiveFilters" type="button" class="empty-action-button" @click="handleResetSearch">查看全部项目</button>
                  <button v-else type="button" class="empty-action-button" @click="showHomeView('create')">新建项目</button>
                </div>
              </div>
            </section>
          </div>
        </Transition>
      </main>
    </div>

    <el-dialog
      v-model="createDialogVisible"
      class="project-dialog"
      :title="creationPrompt ? '确认新项目' : '新建项目'"
      width="460px"
      :lock-scroll="false"
      :close-on-click-modal="!creating"
      :close-on-press-escape="!creating"
      :show-close="!creating"
      destroy-on-close
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" :disabled="creating" label-position="top">
        <el-form-item label="项目名称" prop="title">
          <el-input v-model="createForm.title" placeholder="例如：像素冒险" maxlength="20" show-word-limit clearable />
        </el-form-item>
        <el-form-item label="项目类型" prop="type">
          <el-radio-group v-model="createForm.type" class="project-type-picker">
            <el-radio-button v-for="type in projectTypeOptions" :key="type" :value="type">
              <SvgIcon :name="`project-${type}`" />
              <span>{{ PROJECT_TYPE_LABEL[type] }}</span>
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="createForm.desc" type="textarea" :rows="3" placeholder="简单记录项目目标（选填）" />
        </el-form-item>
      </el-form>
      <div v-if="creationPrompt" class="creation-demand">
        <span>首条需求</span>
        <p>{{ creationPrompt }}</p>
      </div>
      <template #footer>
        <el-button :disabled="creating" @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateProject">{{ creationPrompt ? '创建并开始对话' : '创建项目' }}</el-button>
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
