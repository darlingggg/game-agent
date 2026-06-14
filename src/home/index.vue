<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createProject, getProjectList, deleteProject, type projectItem } from '@/http/project'
import { getUserInfo } from '@/http/user'
import { Delete, Edit, Search } from '@element-plus/icons-vue'
import { useProjectStore } from '@/stores/project'
import { saveProjectConfig } from '@/utils/projectConfig'

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
})

/** 新建项目校验规则 */
const createRules: FormRules = {
  title: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
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
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目列表加载失败')
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
    })
    ElMessage.success('项目创建成功')
    createDialogVisible.value = false
    await fetchProjectList()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目创建失败')
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
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目配置保存失败')
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
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '用户信息加载失败')
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
            <svg t="1781413035262" class="icon-svg" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5716" width="200" height="200">
              <path
                d="M128 448a96 96 0 0 1 28.032 187.84v63.232l0.256 4.288a32 32 0 0 0 15.68 23.424l324.032 187.072 3.84 1.856a32.128 32.128 0 0 0 28.16-1.92l323.968-187.008 3.52-2.368a32 32 0 0 0 12.416-25.344v-11.072a32 32 0 0 1 64 0v11.072a96 96 0 0 1-37.376 76.096l-10.56 7.04-323.968 187.072a96.128 96.128 0 0 1-84.544 5.632l-11.456-5.632-324.032-187.072a96 96 0 0 1-47.104-70.4l-0.896-12.736V632.96A96 96 0 0 1 128 448z m338.56-96c22.08 0 41.792 14.144 48.96 35.2l84.352 248.448a27.52 27.52 0 1 1-52.288 17.216L526.72 587.136H404.608l-21.76 66.432a26.752 26.752 0 1 1-50.752-16.96l85.376-249.6A51.84 51.84 0 0 1 466.56 352z m209.92 0a27.52 27.52 0 0 1 27.52 27.584v264.896a27.584 27.584 0 0 1-55.104 0V379.52a27.52 27.52 0 0 1 27.52-27.52zM128 512a32 32 0 1 0 0 64 32 32 0 0 0 0-64zM475.456 49.152A96 96 0 0 1 560 54.784l323.968 187.072 10.56 7.04a96 96 0 0 1 37.44 76.096v65.92a96 96 0 1 1-64-2.752v-63.168a32 32 0 0 0-12.48-25.344l-3.584-2.368L528 110.208a32 32 0 0 0-28.16-1.92l-3.84 1.92-324.032 187.072a32 32 0 0 0-16 27.712v11.008a32 32 0 0 1-64 0v-11.008a96 96 0 0 1 48-83.2L464 54.848l11.456-5.632z m-54.4 487.296h89.28l-41.728-130.496h-5.056l-42.496 130.56zM896 448a32 32 0 1 0 0 64 32 32 0 0 0 0-64z"
                p-id="5717"
                fill="#2c2c2c"
              ></path>
            </svg>
          </div>
          <div class="title">
            <span>GameAgent</span>
          </div>
        </div>
        <div class="header-user">
          <svg t="1781413498286" class="icon-user" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="11247" width="200" height="200">
            <path
              d="M746.666667 657.066667c-29.866667-29.866667-64-51.2-102.4-68.266667 29.866667-34.133333 51.2-76.8 51.2-128 0-102.4-81.066667-183.466667-183.466667-183.466667s-183.466667 81.066667-183.466667 183.466667c0 51.2 21.333333 93.866667 51.2 128-38.4 17.066667-72.533333 38.4-102.4 68.266667-17.066667 17.066667-17.066667 42.666667 0 59.733333 8.533333 8.533333 21.333333 12.8 29.866667 12.8 12.8 0 21.333333-4.266667 29.866667-12.8 46.933333-46.933333 106.666667-72.533333 174.933333-72.533333 64 0 128 25.6 174.933333 72.533333 17.066667 17.066667 42.666667 17.066667 59.733334 0 17.066667-17.066667 17.066667-42.666667 0-59.733333z m-332.8-196.266667c0-55.466667 42.666667-98.133333 98.133333-98.133333 55.466667 0 98.133333 42.666667 98.133333 98.133333 0 55.466667-42.666667 98.133333-98.133333 98.133333-55.466667 0-98.133333-42.666667-98.133333-98.133333z"
              p-id="11248"
            ></path>
            <path
              d="M512 85.333333C276.352 85.333333 85.333333 276.352 85.333333 512s191.018667 426.666667 426.666667 426.666667 426.666667-191.018667 426.666667-426.666667S747.648 85.333333 512 85.333333zM170.666667 512a341.333333 341.333333 0 1 1 682.666666 0 341.333333 341.333333 0 0 1-682.666666 0z"
              p-id="11249"
            ></path>
          </svg>
          <div class="header-user-name">{{ nickName }}</div>
        </div>
      </header>
      <main class="main">
        <div class="main-header">
          <h2 class="main-title">项目列表</h2>
          <span class="main-count">{{ projectCount }} 个项目</span>
        </div>

        <div class="main-search">
          <el-input v-model="searchInput" class="main-search-input" placeholder="搜索项目" :prefix-icon="Search" clearable @input="handleSearchInput" />
          <el-button type="warning" dashed @click="handleResetSearch">重置</el-button>
        </div>

        <div v-loading="listLoading" class="project-grid">
          <article v-for="project in displayedProjects" :key="project.id" class="project-card">
            <el-button class="card-delete" type="danger" :icon="Delete" dashed @click="handleDeletePro(project.id)" />
            <el-button class="card-edit" type="primary" :icon="Edit" dashed @click="handleEditPro(project.id)" />
            <div class="project-card-top">
              <div class="project-card-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                </svg>
              </div>
            </div>

            <h3 class="project-card-name">{{ project.title }}</h3>
            <p class="project-card-desc">{{ getProjectDesc(project.desc) }}</p>

            <div class="project-card-footer">
              <div class="project-card-time">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" />
                  <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.5" />
                </svg>
                <span>{{ formatProjectTime(project.createdAt) }}</span>
              </div>
              <button type="button" class="project-card-enter" @click="handleEnterProject(project)">进入项目 →</button>
            </div>
          </article>

          <button type="button" class="project-card project-card--create" @click="openCreateDialog">
            <div class="project-create-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" />
              </svg>
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
  background: radial-gradient(#fff, #f6f9fd);
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
}
.icon {
  width: 2.5rem;
  height: 2.5rem;
}
.icon-svg {
  width: 2.5rem;
  height: 2.5rem;
}
.header-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0.5rem 0.8rem;
  border-radius: 0.2rem;
  border: 1px solid #e5e5e5;
  cursor: pointer;
  background-color: #fff;
}
.icon-user {
  width: 1.5rem;
  height: 1.5rem;
}
.header-user-name {
  font-size: 0.9rem;
  line-height: 0.9rem;
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
  color: #1a1c1e;
}

.main-count {
  font-size: 0.875rem;
  color: #73767a;
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
  border: 1px solid #e0e0e6;
  box-shadow: none;
  margin-left: 3px;
  transition: all 0.2s ease;
}

.main-search-input :deep(.el-input__wrapper.is-focus) {
  border: 1px solid #2463dc;
  box-shadow: 0 0 0 2px rgba(0, 89, 255, 0.2);
}

.main-search-input :deep(.el-input__prefix .el-icon) {
  color: #a8abb2;
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
  background-color: #fff;
  color: gray;
}

.card-delete:hover {
  color: #f11212;
}

.card-edit:hover {
  color: #000;
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
  background-color: #fff;
  border: 1px solid #e8ebf0;
  border-radius: 0.35rem;
  box-shadow: 0 3px 5px rgba(0, 0, 0, 0.1);
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
  background-color: #eef4ff;
  color: #2463dc;
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
  color: #73767a;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background-color: #fff;
}

.project-card-name,
.project-create-title {
  margin: 0 0 0.375rem;
  font-size: 1rem;
  font-weight: 700;
  color: #1a1c1e;
}

.project-card-desc,
.project-create-desc {
  margin: 0 0 1.25rem;
  font-size: 0.8125rem;
  color: #73767a;
  line-height: 1.5;
}

.project-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: auto;
}

.project-card-time {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: #9ca3af;
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
  color: #2463dc;
  cursor: pointer;
  white-space: nowrap;
}

.project-card-enter:hover {
  text-decoration: underline;
}

.project-card--create {
  align-items: center;
  justify-content: center;
  min-height: 11rem;
  text-align: center;
  border: 1px dashed #c8d4e6;
  background-color: #fff;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.project-card--create:hover {
  border-color: #2463dc;
  background-color: #f0f6ff;
}

.project-card--create:hover .project-create-icon {
  background-color: #fff;
}
.project-create-icon {
  margin-bottom: 0.875rem;
}

.project-create-desc {
  margin-bottom: 0;
  max-width: 12rem;
}
</style>
