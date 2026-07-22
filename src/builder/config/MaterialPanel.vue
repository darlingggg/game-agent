<script setup lang="ts">
import { Folder, Document, RefreshRight, Upload, Close, Delete, Picture } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  deleteProjectAsset,
  downloadProjectFiles,
  fetchProjectAssetBlob,
  type FileDownloadResultItem,
} from '@/http/file'
import { useProjectStore } from '@/stores/project'
import {
  fetchProjectTempFileList,
  normalizeRelativePath,
  type ProjectTempFileItem,
} from '../file/projectTempFiles'
import { PROJECT_FILES_CHANGED_EVENT } from '../snapshot/snapshotRestore'

defineOptions({
  name: 'MaterialPanel',
})

/** 本地单文件最大字节数（3MB） */
const MAX_FILE_BYTES = 3 * 1024 * 1024

/** 单次最多本地文件数 */
const MAX_FILE_COUNT = 20

/** public 根相对路径 */
const PUBLIC_ROOT = 'public'

/** 受保护、不可删除的素材相对路径 */
const PROTECTED_ASSET_PATH = 'public/favicon.ico'

/** 可本地预览的图片 MIME 前缀 */
const IMAGE_MIME_PREFIX = 'image/'

/** 可本地预览的图片后缀 */
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.ico',
])

/** 待上传本地文件项 */
interface PendingFileItem {
  /** 本地文件 */
  file: File
  /** 自定义保存名，默认原始文件名 */
  saveName: string
  /** 本地预览 blob URL（图片才有） */
  previewUrl: string
}

/** 待导入远程 URL 项 */
interface PendingUrlItem {
  /** 远程地址 */
  url: string
  /** 自定义保存名，空则用 URL 末尾文件名 */
  saveName: string
}

/** 列表项：文件或可进入的子目录 */
interface MaterialListItem {
  /** 显示名 */
  name: string
  /** 相对项目根路径 */
  path: string
  /** 节点类型 */
  type: 'file' | 'directory'
  /** 文件字节数（仅文件） */
  bytes?: number
}

const projectStore = useProjectStore()

/** 上传保存子目录（相对 public），默认 / */
const uploadPath = ref('/')

/** 待上传本地文件 */
const pendingFiles = ref<PendingFileItem[]>([])

/** 远程 URL 多行文本（用于快速粘贴） */
const urlText = ref('')

/** 解析后的 URL 项（可编辑保存名） */
const pendingUrls = ref<PendingUrlItem[]>([])

/** 上传中 */
const uploading = ref(false)

/** 最近一次导入结果明细 */
const lastResults = ref<FileDownloadResultItem[]>([])

/** 当前浏览目录（相对项目根，始终以 public 开头） */
const browseDir = ref(PUBLIC_ROOT)

/** 全量 public 下文件 */
const publicFiles = ref<ProjectTempFileItem[]>([])

/** 列表加载中 */
const listLoading = ref(false)

/** 列表加载错误 */
const listError = ref('')

/** 正在删除的文件相对路径 */
const deletingPath = ref('')

/** 已有素材预览 URL，key 为相对路径 */
const browsePreviewUrls = ref<Record<string, string>>({})

/** 预览加载序号，避免目录切换后过期结果写入 */
let browsePreviewToken = 0

/** 文件选择 input 引用 */
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 是否已有项目路径 */
const hasProjectDir = computed(() => !!projectStore.currentProject?.dirPath)

/** 是否可提交上传 */
const canSubmit = computed(() => {
  return (
    hasProjectDir.value
    && !uploading.value
    && (pendingFiles.value.length > 0 || pendingUrls.value.length > 0)
  )
})

/** 当前浏览目录下的直接子项 */
const browseItems = computed((): MaterialListItem[] => {
  const dir = browseDir.value
  const prefix = `${dir}/`
  const dirSet = new Map<string, MaterialListItem>()
  const files: MaterialListItem[] = []

  for (const file of publicFiles.value) {
    const rel = normalizeRelativePath(file.relativePath)
    if (rel === dir || !rel.startsWith(prefix)) continue

    const rest = rel.slice(prefix.length)
    const slashIndex = rest.indexOf('/')
    if (slashIndex < 0) {
      files.push({
        name: file.name || rest,
        path: rel,
        type: 'file',
        bytes: file.bytes,
      })
      continue
    }

    const childName = rest.slice(0, slashIndex)
    const childPath = `${dir}/${childName}`
    if (!dirSet.has(childPath)) {
      dirSet.set(childPath, {
        name: childName,
        path: childPath,
        type: 'directory',
      })
    }
  }

  const dirs = [...dirSet.values()].sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
})

/** 是否可返回上级（不可超出 public） */
const canGoUp = computed(() => browseDir.value !== PUBLIC_ROOT)

/**
 * 判断是否为受保护、不可删除的素材
 * @param relativePath 相对项目根路径
 */
function isProtectedAsset(relativePath: string): boolean {
  return normalizeRelativePath(relativePath) === PROTECTED_ASSET_PATH
}

/**
 * 规范化上传 path：空 → /；保证前导 /
 * @param raw 用户输入
 */
function normalizeUploadPath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, '/')
  if (!trimmed || trimmed === '/') return '/'
  const withoutEdge = trimmed.replace(/^\/+|\/+$/g, '')
  return withoutEdge ? `/${withoutEdge}` : '/'
}

/**
 * 格式化字节大小
 * @param bytes 字节数
 */
function formatBytes(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 判断文件是否可本地图片预览
 * @param file 本地文件
 */
function isImageFile(file: File): boolean {
  if (file.type.startsWith(IMAGE_MIME_PREFIX)) return true
  return isImagePath(file.name)
}

/**
 * 根据路径/文件名判断是否为图片
 * @param filePath 路径或文件名
 */
function isImagePath(filePath: string): boolean {
  const name = filePath.toLowerCase()
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex < 0) return false
  return IMAGE_EXTENSIONS.has(name.slice(dotIndex))
}

/**
 * 释放待上传项的预览 URL
 * @param items 待上传项列表
 */
function revokePreviewUrls(items: PendingFileItem[]) {
  for (const item of items) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
    }
  }
}

/**
 * 清空已有素材预览 URL
 */
function clearBrowsePreviewUrls() {
  for (const url of Object.values(browsePreviewUrls.value)) {
    URL.revokeObjectURL(url)
  }
  browsePreviewUrls.value = {}
}

/**
 * 加载当前浏览目录下图片预览
 * @param items 当前目录项
 */
async function loadBrowsePreviews(items: MaterialListItem[]) {
  const token = ++browsePreviewToken
  clearBrowsePreviewUrls()

  const dirPath = projectStore.currentProject?.dirPath
  if (!dirPath) return

  const imageItems = items.filter((item) => item.type === 'file' && isImagePath(item.path))
  if (!imageItems.length) return

  const nextMap: Record<string, string> = {}
  await Promise.all(
    imageItems.map(async (item) => {
      try {
        const blob = await fetchProjectAssetBlob({
          dirPath,
          path: item.path,
        })
        if (token !== browsePreviewToken) return
        nextMap[item.path] = URL.createObjectURL(blob)
      } catch {
        // 单张预览失败不影响列表
      }
    }),
  )

  if (token !== browsePreviewToken) {
    for (const url of Object.values(nextMap)) {
      URL.revokeObjectURL(url)
    }
    return
  }

  browsePreviewUrls.value = nextMap
}

/**
 * 清空待上传本地文件并释放预览
 */
function clearPendingFiles() {
  revokePreviewUrls(pendingFiles.value)
  pendingFiles.value = []
}

/**
 * 从多行文本同步 URL 列表，尽量保留已填写的自定义保存名
 * @param text 多行 URL 文本
 */
function syncPendingUrlsFromText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const prevByUrl = new Map<string, string>()
  for (const item of pendingUrls.value) {
    if (!prevByUrl.has(item.url)) {
      prevByUrl.set(item.url, item.saveName)
    }
  }

  pendingUrls.value = lines.map((url) => ({
    url,
    saveName: prevByUrl.get(url) ?? '',
  }))
}

watch(urlText, (text) => {
  syncPendingUrlsFromText(text)
})

/**
 * 加载 public 下素材列表
 */
async function loadPublicFiles() {
  if (!hasProjectDir.value) {
    publicFiles.value = []
    listError.value = '请先选择项目'
    return
  }

  listLoading.value = true
  listError.value = ''
  try {
    const list = await fetchProjectTempFileList()
    publicFiles.value = list.filter((item) => {
      const rel = normalizeRelativePath(item.relativePath)
      return rel === PUBLIC_ROOT || rel.startsWith(`${PUBLIC_ROOT}/`)
    })
  } catch (error) {
    listError.value = error instanceof Error ? error.message : '素材列表加载失败'
    publicFiles.value = []
  } finally {
    listLoading.value = false
  }
}

/**
 * 打开本地文件选择
 */
function openFilePicker() {
  fileInputRef.value?.click()
}

/**
 * 处理本地文件选择
 * @param event change 事件
 */
function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  input.value = ''
  if (!selected.length) return

  const next = [...pendingFiles.value]
  for (const file of selected) {
    if (file.size > MAX_FILE_BYTES) {
      ElMessage.warning(`「${file.name}」超过 3MB，已跳过`)
      continue
    }
    if (next.length >= MAX_FILE_COUNT) {
      ElMessage.warning(`单次最多上传 ${MAX_FILE_COUNT} 个本地文件`)
      break
    }
    const duplicated = next.some(
      (item) => item.file.name === file.name && item.file.size === file.size,
    )
    if (!duplicated) {
      next.push({
        file,
        saveName: file.name,
        previewUrl: isImageFile(file) ? URL.createObjectURL(file) : '',
      })
    }
  }
  pendingFiles.value = next
}

/**
 * 移除待上传本地文件
 * @param index 索引
 */
function removePendingFile(index: number) {
  const target = pendingFiles.value[index]
  if (target?.previewUrl) {
    URL.revokeObjectURL(target.previewUrl)
  }
  pendingFiles.value = pendingFiles.value.filter((_, i) => i !== index)
}

/**
 * 校验 URL 列表，返回合法项；非法项给出提示
 */
function collectValidUrlItems(): PendingUrlItem[] {
  const valid: PendingUrlItem[] = []
  let invalidCount = 0
  for (const item of pendingUrls.value) {
    if (/^https?:\/\//i.test(item.url)) {
      valid.push(item)
    } else {
      invalidCount += 1
    }
  }
  if (invalidCount) {
    ElMessage.warning(`已忽略 ${invalidCount} 个非 http(s) 地址`)
  }
  return valid
}

/**
 * 组装 saveNames：先 urls 再 files；全与默认一致且为空语义时可不传，但有自定义则始终传
 * @param urls 有效 URL 项
 * @param files 本地文件项
 */
function buildSaveNames(urls: PendingUrlItem[], files: PendingFileItem[]): string[] | undefined {
  const names = [
    ...urls.map((item) => item.saveName.trim()),
    ...files.map((item) => {
      const name = item.saveName.trim()
      return name || item.file.name
    }),
  ]
  if (names.every((name) => !name)) return undefined
  return names
}

/**
 * 从 URL 提取默认文件名
 * @param url 远程地址
 */
function getUrlDefaultFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const segment = pathname.split('/').filter(Boolean).pop() || ''
    return decodeURIComponent(segment) || 'download'
  } catch {
    const segment = url.split('?')[0]?.split('/').filter(Boolean).pop() || ''
    return segment || 'download'
  }
}

/**
 * 解析单项最终保存文件名
 * @param saveName 自定义名
 * @param fallback 默认名
 */
function resolveSaveFileName(saveName: string, fallback: string): string {
  return saveName.trim() || fallback
}

/**
 * 根据上传子目录拼出相对项目根的目标路径
 * @param fileName 保存文件名
 */
function buildTargetRelativePath(fileName: string): string {
  const subDir = normalizeUploadPath(uploadPath.value).replace(/^\/+|\/+$/g, '')
  return subDir ? `${PUBLIC_ROOT}/${subDir}/${fileName}` : `${PUBLIC_ROOT}/${fileName}`
}

/**
 * 收集本次导入会覆盖的已有同名文件
 * @param urls 有效 URL 项
 * @param files 本地文件项
 */
function collectOverwriteNames(urls: PendingUrlItem[], files: PendingFileItem[]): string[] {
  const existing = new Set(
    publicFiles.value.map((item) => normalizeRelativePath(item.relativePath).toLowerCase()),
  )
  const conflicts: string[] = []
  const seen = new Set<string>()

  const candidates = [
    ...urls.map((item) => resolveSaveFileName(item.saveName, getUrlDefaultFileName(item.url))),
    ...files.map((item) => resolveSaveFileName(item.saveName, item.file.name)),
  ]

  for (const fileName of candidates) {
    const targetPath = buildTargetRelativePath(fileName)
    const key = targetPath.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (existing.has(key)) {
      conflicts.push(fileName)
    }
  }

  return conflicts
}

/**
 * 提交导入
 */
async function handleSubmit() {
  if (!canSubmit.value) return

  let dirPath = ''
  try {
    dirPath = projectStore.requireProjectDirPath()
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : '请先选择项目')
    return
  }

  const urlItems = collectValidUrlItems()
  const fileItems = pendingFiles.value
  if (!urlItems.length && !fileItems.length) {
    ElMessage.warning('请选择本地文件或填写远程 URL')
    return
  }

  // 先刷新列表，再判断目标目录是否存在同名文件
  await loadPublicFiles()
  const overwriteNames = collectOverwriteNames(urlItems, fileItems)
  if (overwriteNames.length) {
    const preview = overwriteNames.slice(0, 5).join('、')
    const more = overwriteNames.length > 5 ? ` 等 ${overwriteNames.length} 个` : ''
    try {
      await ElMessageBox.confirm(
        `以下文件已存在，继续将直接覆盖：${preview}${more}`,
        '确认覆盖',
        {
          type: 'warning',
          confirmButtonText: '继续',
          cancelButtonText: '取消',
        },
      )
    } catch {
      return
    }
  }

  uploading.value = true
  lastResults.value = []
  try {
    const urls = urlItems.map((item) => item.url)
    const files = fileItems.map((item) => item.file)
    const saveNames = buildSaveNames(urlItems, fileItems)

    const data = await downloadProjectFiles({
      dirPath,
      path: normalizeUploadPath(uploadPath.value),
      urls: urls.length ? urls : undefined,
      files: files.length ? files : undefined,
      saveNames,
    })

    const results = data?.results ?? []
    lastResults.value = results
    const successCount = results.filter((item) => item.success).length
    const failCount = results.length - successCount

    if (failCount === 0) {
      ElMessage.success(results.length ? `成功导入 ${successCount} 个素材` : '处理成功')
    } else if (successCount > 0) {
      ElMessage.warning(`部分成功：成功 ${successCount} 个，失败 ${failCount} 个`)
    } else {
      ElMessage.error(`全部失败（${failCount} 个）`)
    }

    clearPendingFiles()
    urlText.value = ''
    pendingUrls.value = []
    window.dispatchEvent(new CustomEvent(PROJECT_FILES_CHANGED_EVENT))
    await loadPublicFiles()
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    uploading.value = false
  }
}

/**
 * 删除素材文件
 * @param item 列表文件项
 */
async function handleDeleteAsset(item: MaterialListItem) {
  if (item.type !== 'file' || deletingPath.value) return

  if (isProtectedAsset(item.path)) {
    ElMessage.warning('不允许删除 public/favicon.ico，可通过上传同名文件替换')
    return
  }

  let dirPath = ''
  try {
    dirPath = projectStore.requireProjectDirPath()
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : '请先选择项目')
    return
  }

  try {
    await ElMessageBox.confirm(`确认删除「${item.name}」？删除后不可恢复。`, '删除素材', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  deletingPath.value = item.path
  try {
    await deleteProjectAsset({
      dirPath,
      path: item.path,
    })
    ElMessage.success('删除成功')
    window.dispatchEvent(new CustomEvent(PROJECT_FILES_CHANGED_EVENT))
    await loadPublicFiles()
  } catch {
    // 错误提示由 axios 拦截器统一处理
  } finally {
    deletingPath.value = ''
  }
}

/**
 * 进入子目录
 * @param path 相对项目根路径
 */
function enterDirectory(path: string) {
  browseDir.value = path
}

/**
 * 返回上级目录
 */
function goUpDirectory() {
  if (!canGoUp.value) return
  const parts = browseDir.value.split('/')
  parts.pop()
  browseDir.value = parts.join('/') || PUBLIC_ROOT
}

onMounted(() => {
  void loadPublicFiles()
})

watch(
  browseItems,
  (items) => {
    void loadBrowsePreviews(items)
  },
  { immediate: true },
)

onUnmounted(() => {
  browsePreviewToken += 1
  revokePreviewUrls(pendingFiles.value)
  clearBrowsePreviewUrls()
})
</script>

<template>
  <div class="material-panel">
    <section class="config-section-card">
      <div class="config-section-head">
        <h2 class="config-section-title">上传素材</h2>
        <p class="config-section-desc">
          写入当前项目 public 目录；本地单文件 ≤3MB，单次 ≤20 个；可自定义保存名（如 favicon.ico）
        </p>
      </div>

      <div class="material-upload-body">
        <div class="material-field">
          <label class="material-field-label">保存子目录</label>
          <el-input
            v-model="uploadPath"
            placeholder="默认 /，如 /images"
            clearable
            :disabled="uploading || !hasProjectDir"
          />
          <p class="material-field-hint">相对 public，默认根目录 /</p>
        </div>

        <div class="material-field">
          <div class="material-field-row">
            <label class="material-field-label">本地文件</label>
            <button
              type="button"
              class="config-action-btn config-action-btn--sm"
              :disabled="uploading || !hasProjectDir"
              @click="openFilePicker"
            >
              <el-icon><Upload /></el-icon>
              选择文件
            </button>
            <input
              ref="fileInputRef"
              type="file"
              class="material-file-input"
              multiple
              @change="handleFileChange"
            />
          </div>
          <ul v-if="pendingFiles.length" class="material-preview-grid">
            <li
              v-for="(item, index) in pendingFiles"
              :key="`${item.file.name}-${item.file.size}-${index}`"
              class="material-preview-card"
            >
              <button
                type="button"
                class="material-preview-remove"
                title="移除"
                :disabled="uploading"
                @click="removePendingFile(index)"
              >
                <el-icon><Close /></el-icon>
              </button>
              <div class="material-preview-thumb">
                <img
                  v-if="item.previewUrl"
                  :src="item.previewUrl"
                  class="material-preview-img"
                  :alt="item.file.name"
                />
                <div v-else class="material-preview-fallback" :title="item.file.name">
                  <el-icon class="material-preview-fallback-icon"><Picture /></el-icon>
                  <span class="material-preview-fallback-ext">
                    {{ item.file.name.split('.').pop()?.toUpperCase() || 'FILE' }}
                  </span>
                </div>
              </div>
              <div class="material-preview-meta">
                <span class="material-preview-size">{{ formatBytes(item.file.size) }}</span>
              </div>
              <el-input
                v-model="item.saveName"
                class="material-save-name-input"
                size="small"
                placeholder="保存文件名"
                clearable
                :disabled="uploading"
              />
            </li>
          </ul>
          <p v-else class="material-field-hint">未选择本地文件</p>
        </div>

        <div class="material-field">
          <label class="material-field-label">远程 URL</label>
          <el-input
            v-model="urlText"
            type="textarea"
            :rows="3"
            placeholder="一行一个 http(s) 地址"
            resize="none"
            :disabled="uploading || !hasProjectDir"
          />
          <ul v-if="pendingUrls.length" class="material-pending-list">
            <li
              v-for="(item, index) in pendingUrls"
              :key="`${item.url}-${index}`"
              class="material-pending-item material-pending-item--edit"
            >
              <div class="material-pending-main">
                <span class="material-pending-name" :title="item.url">{{ item.url }}</span>
              </div>
              <el-input
                v-model="item.saveName"
                class="material-save-name-input"
                size="small"
                placeholder="保存为（默认取 URL 文件名）"
                clearable
                :disabled="uploading"
              />
            </li>
          </ul>
        </div>

        <div class="material-upload-footer">
          <button
            type="button"
            class="config-action-btn"
            :class="{ 'config-action-btn--loading': uploading }"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            {{ uploading ? '导入中...' : '开始导入' }}
          </button>
        </div>

        <ul v-if="lastResults.length" class="material-result-list">
          <li
            v-for="(item, index) in lastResults"
            :key="index"
            class="material-result-item"
            :class="{ 'material-result-item--fail': !item.success }"
          >
            <span class="material-result-name">
              {{ item.fileName || item.originalName || item.url || '未知文件' }}
            </span>
            <span class="material-result-status">
              {{ item.success ? '成功' : (item.message || '失败') }}
            </span>
          </li>
        </ul>
      </div>
    </section>

    <section class="config-section-card">
      <div class="config-section-head material-browse-head">
        <div>
          <h2 class="config-section-title">已有素材</h2>
          <p class="config-section-desc">
            独立浏览 public；favicon.ico 不可删除，可上传同名覆盖
          </p>
        </div>
        <button
          type="button"
          class="config-action-btn config-action-btn--sm"
          :disabled="listLoading || !hasProjectDir"
          @click="loadPublicFiles"
        >
          <el-icon><RefreshRight /></el-icon>
          刷新
        </button>
      </div>

      <div class="material-browse-body" v-loading="listLoading">
        <div class="material-browse-nav">
          <button
            type="button"
            class="config-action-btn config-action-btn--sm"
            :disabled="!canGoUp || listLoading"
            @click="goUpDirectory"
          >
            上级
          </button>
          <span class="material-browse-path" :title="browseDir">{{ browseDir }}/</span>
        </div>

        <p v-if="listError" class="material-browse-error">{{ listError }}</p>
        <p v-else-if="!listLoading && browseItems.length === 0" class="material-browse-empty">
          当前目录暂无素材
        </p>
        <ul v-else class="material-browse-grid">
          <li
            v-for="item in browseItems"
            :key="item.path"
            class="material-browse-card"
            :class="{ 'material-browse-card--dir': item.type === 'directory' }"
            @click="item.type === 'directory' ? enterDirectory(item.path) : undefined"
          >
            <button
              v-if="item.type === 'file'"
              type="button"
              class="material-browse-delete"
              :class="{ 'material-browse-delete--protected': isProtectedAsset(item.path) }"
              :title="isProtectedAsset(item.path) ? 'favicon.ico 不可删除，可上传替换' : '删除'"
              :disabled="!!deletingPath || isProtectedAsset(item.path)"
              @click.stop="handleDeleteAsset(item)"
            >
              <el-icon><Delete /></el-icon>
            </button>

            <div class="material-browse-thumb">
              <img
                v-if="item.type === 'file' && browsePreviewUrls[item.path]"
                :src="browsePreviewUrls[item.path]"
                class="material-browse-img"
                :alt="item.name"
              />
              <div v-else class="material-browse-fallback">
                <el-icon class="material-browse-fallback-icon">
                  <Folder v-if="item.type === 'directory'" />
                  <Picture v-else-if="isImagePath(item.path)" />
                  <Document v-else />
                </el-icon>
                <span v-if="item.type === 'file'" class="material-browse-fallback-ext">
                  {{ item.name.split('.').pop()?.toUpperCase() || 'FILE' }}
                </span>
                <span v-else class="material-browse-fallback-ext">目录</span>
              </div>
            </div>

            <div class="material-browse-info">
              <span class="material-browse-name" :title="item.path">{{ item.name }}</span>
              <span v-if="item.type === 'file' && item.bytes != null" class="material-browse-size">
                {{ formatBytes(item.bytes) }}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.material-panel {
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

.material-browse-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.material-upload-body,
.material-browse-body {
  padding: 0.875rem;
}

.material-field {
  margin-bottom: 0.875rem;
}

.material-field:last-of-type {
  margin-bottom: 0;
}

.material-field-label {
  display: block;
  margin-bottom: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--app-text-primary);
  line-height: 1.35;
}

.material-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.material-field-row .material-field-label {
  margin-bottom: 0;
}

.material-field-hint {
  margin: 0.375rem 0 0;
  font-size: 0.75rem;
  color: var(--app-text-muted);
  line-height: 1.4;
}

.material-file-input {
  display: none;
}

.material-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.625rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.material-preview-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem;
  border: 1px solid var(--config-group-border);
  border-radius: var(--config-radius-md);
  background: var(--app-bg-subtle);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.material-preview-card:hover {
  border-color: var(--config-accent-border);
  box-shadow: 0 1px 4px rgba(30, 79, 168, 0.08);
}

.material-preview-remove {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  padding: 0;
  border: 1px solid var(--config-group-border);
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-muted);
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.material-preview-remove:hover:not(:disabled) {
  color: #c45656;
  border-color: #f0b4b4;
  background: #fff5f5;
}

.material-preview-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.material-preview-thumb {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--config-radius-sm);
  background: var(--app-surface);
  border: 1px solid var(--config-group-border);
}

.material-preview-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.material-preview-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
  color: var(--config-accent-text-muted);
  background: linear-gradient(160deg, var(--config-accent-bg) 0%, var(--app-surface) 100%);
}

.material-preview-fallback-icon {
  font-size: 1.5rem;
}

.material-preview-fallback-ext {
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.material-preview-meta {
  display: flex;
  justify-content: center;
}

.material-preview-size {
  font-size: 0.6875rem;
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.material-save-name-input {
  width: 100%;
}

.material-save-name-input :deep(.el-input__inner) {
  text-align: center;
  font-size: 0.75rem;
}

.material-pending-list,
.material-result-list {
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
  max-height: 10rem;
  overflow-y: auto;
  scrollbar-width: thin;
}

.material-pending-item,
.material-result-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--config-group-border);
  border-radius: var(--config-radius-sm);
  background: var(--app-bg-subtle);
}

.material-pending-item--edit {
  flex-direction: column;
  align-items: stretch;
  gap: 0.375rem;
}

.material-pending-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.material-pending-item + .material-pending-item,
.material-result-item + .material-result-item {
  margin-top: 0.375rem;
}

.material-pending-name,
.material-result-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  color: var(--app-text-primary);
}

.material-pending-size,
.material-result-status {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
}

.material-browse-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.625rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.material-browse-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem;
  border: 1px solid var(--config-group-border);
  border-radius: var(--config-radius-md);
  background: var(--app-bg-subtle);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.material-browse-card--dir {
  cursor: pointer;
}

.material-browse-card:hover {
  border-color: var(--config-accent-border);
  box-shadow: 0 1px 4px rgba(30, 79, 168, 0.08);
}

.material-browse-thumb {
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--config-radius-sm);
  background: var(--app-surface);
  border: 1px solid var(--config-group-border);
}

.material-browse-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.material-browse-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
  color: var(--config-accent-text-muted);
  background: linear-gradient(160deg, var(--config-accent-bg) 0%, var(--app-surface) 100%);
}

.material-browse-fallback-icon {
  font-size: 1.5rem;
}

.material-browse-fallback-ext {
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.material-browse-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  min-width: 0;
}

.material-browse-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--app-text-primary);
  line-height: 1.3;
  text-align: center;
}

.material-browse-size {
  font-size: 0.6875rem;
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.material-browse-delete {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  padding: 0;
  border: 1px solid var(--config-group-border);
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-muted);
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.material-browse-delete:hover:not(:disabled) {
  color: #c45656;
  border-color: #f0b4b4;
  background: #fff5f5;
}

.material-browse-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.material-browse-delete--protected {
  opacity: 0.35;
  cursor: not-allowed;
}

.material-upload-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.875rem;
}

.material-result-item--fail .material-result-status {
  color: #c45656;
}

.material-browse-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.material-browse-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  color: var(--app-text-secondary);
  font-variant-numeric: tabular-nums;
}

.material-browse-error,
.material-browse-empty {
  margin: 0;
  padding: 1rem 0.5rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--app-text-muted);
}

.material-browse-error {
  color: #c45656;
}

.config-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
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

.config-action-btn--sm {
  height: 1.75rem;
  padding: 0 0.625rem;
  font-size: 0.75rem;
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

.material-upload-body :deep(.el-input__wrapper),
.material-upload-body :deep(.el-textarea__inner) {
  border-radius: var(--config-radius-sm);
  box-shadow: 0 0 0 1px var(--config-group-border) inset;
  background-color: var(--app-bg-subtle);
}

.material-upload-body :deep(.el-input__wrapper:hover),
.material-upload-body :deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px var(--config-accent-border) inset;
}

.material-upload-body :deep(.el-input__wrapper.is-focus),
.material-upload-body :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px var(--config-accent-border-hover) inset;
}

.material-upload-body :deep(.el-input__inner),
.material-upload-body :deep(.el-textarea__inner) {
  font-size: 0.8125rem;
  color: var(--app-text-primary);
}
</style>
