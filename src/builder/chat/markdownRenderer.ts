import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/** Markdown 解析器（单例，避免重复创建） */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

interface MarkdownRenderEnvironment {
  hiddenImageSources?: Set<string>
}

function normalizeImageSource(source: string): string {
  const value = source.trim()
  if (!value) return ''

  try {
    const url = new URL(value, 'https://local.invalid')
    return url.origin === 'https://local.invalid' ? url.pathname : `${url.origin}${url.pathname}`
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value
  }
}

/** 为跨域图片补充 crossorigin，兼容 COEP 页面下的 COS 图片展示 */
const defaultImageRender = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const source = token?.attrGet('src')
  const hiddenImageSources = (env as MarkdownRenderEnvironment).hiddenImageSources
  if (source && hiddenImageSources?.has(normalizeImageSource(source))) return ''

  if (token && !token.attrGet('crossorigin')) {
    token.attrSet('crossorigin', 'anonymous')
  }
  if (defaultImageRender) {
    return defaultImageRender(tokens, idx, options, env, self)
  }
  return self.renderToken(tokens, idx, options)
}

/**
 * 将 Markdown 文本转为安全 HTML
 * @param source 原始 Markdown 文本
 */
export function renderMarkdown(source: string, hiddenImageUrls: string[] = []): string {
  if (!source) return ''

  const hiddenImageSources = new Set(hiddenImageUrls.map(normalizeImageSource).filter(Boolean))
  const rawHtml = md.render(source, { hiddenImageSources } satisfies MarkdownRenderEnvironment)
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['crossorigin'],
  })
}
