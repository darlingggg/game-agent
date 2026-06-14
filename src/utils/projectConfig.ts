import { getFileContent, writeFileContent } from '@/http/file'
import { updateProject } from '@/http/project'
import {
  applyProjectHtmlConfig,
  INDEX_HTML_PATH,
} from '@/builder/config/projectHtmlConfig'

/** 保存项目配置参数 */
export interface SaveProjectConfigParams {
  /** 项目 ID */
  id: number
  /** 项目目录绝对路径 */
  dirPath: string
  /** 项目名称 */
  title: string
  /** 项目描述，可选 */
  desc?: string
}

/**
 * 更新项目配置：调用 updateProject 并同步 index.html 的 title 与 meta description
 * @param params 项目配置参数
 * @returns 更新后的 index.html 内容
 */
export async function saveProjectConfig(params: SaveProjectConfigParams): Promise<string> {
  const title = params.title.trim()
  const desc = params.desc?.trim() ?? ''

  await updateProject({ id: params.id, title, desc })

  const html = await getFileContent({ dir: params.dirPath, path: INDEX_HTML_PATH })
  const updatedHtml = applyProjectHtmlConfig(html, {
    name: title,
    description: desc,
  })
  await writeFileContent({
    dir: params.dirPath,
    path: INDEX_HTML_PATH,
    content: updatedHtml,
  })

  return updatedHtml
}
