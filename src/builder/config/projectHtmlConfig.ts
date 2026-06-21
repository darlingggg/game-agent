/** index.html 相对 projectTemp 根目录的路径 */
export const INDEX_HTML_PATH = 'index.html'

/** index.html 中可配置的项目信息 */
export interface ProjectHtmlConfig {
  /** 项目名称，对应 title 标签 */
  name: string
  /** 项目描述，对应 meta description */
  description: string
}

/**
 * 转义 HTML 属性值中的特殊字符
 * @param value 原始文本
 */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 转义 title 标签中的特殊字符
 * @param value 原始文本
 */
function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 从 index.html 内容解析项目配置
 * @param html index.html 文本
 */
export function parseProjectHtmlConfig(html: string): ProjectHtmlConfig {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
  const descMatch =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ??
    html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i)

  return {
    name: titleMatch?.[1]?.trim() ?? '',
    description: descMatch?.[1]?.trim() ?? '',
  }
}

/**
 * 将项目配置写入 index.html
 * @param html 原始 index.html 文本
 * @param config 项目配置
 */
export function applyProjectHtmlConfig(html: string, config: ProjectHtmlConfig): string {
  let result = html
  const titleTag = `<title>${escapeHtmlText(config.name)}</title>`
  const descriptionMeta = `<meta name="description" content="${escapeHtmlAttr(config.description)}">`

  if (/<title>[\s\S]*?<\/title>/i.test(result)) {
    result = result.replace(/<title>[\s\S]*?<\/title>/i, titleTag)
  } else {
    result = result.replace(/<\/head>/i, `  ${titleTag}\n  </head>`)
  }

  if (
    /<meta\s+name=["']description["']\s+content=["'][^"']*["']/i.test(result) ||
    /<meta\s+content=["'][^"']*["']\s+name=["']description["']/i.test(result)
  ) {
    result = result
      .replace(/<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i, descriptionMeta)
      .replace(/<meta\s+content=["'][^"']*["']\s+name=["']description["']\s*\/?>/i, descriptionMeta)
  } else {
    result = result.replace(
      /<meta\s+name=["']viewport["'][^>]*>/i,
      (match) => `${match}\n    ${descriptionMeta}`,
    )
  }

  return result
}
