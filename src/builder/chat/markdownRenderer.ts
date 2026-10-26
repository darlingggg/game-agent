import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/** Markdown 解析器（单例，避免重复创建） */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
interface MarkdownImages {
  imageOverrides?: Record<string, string>
}

function safeImageSource(source: string) {
  try {
    const url = new URL(source, 'https://local.invalid')
    return ['http:', 'https:'].includes(url.protocol) ? source : ''
  } catch {
    return ''
  }
}

function imageName(source: string) {
  const name = source.split(/[?#]/)[0]?.split('/').pop() || '查看图片'
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

/** 为跨域图片补充 crossorigin，兼容 COEP 页面下的 COS 图片展示 */
const defaultImageRender = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const original = token?.attrGet('src') || ''
  const source = safeImageSource((env as MarkdownImages).imageOverrides?.[original] || original)
  if (!source) return ''
  token?.attrSet('src', source)

  if (token && !token.attrGet('crossorigin')) {
    token.attrSet('crossorigin', 'anonymous')
  }
  token?.attrSet('class', 'markdown-image-thumb')
  token?.attrSet('loading', 'lazy')
  const image = defaultImageRender ? defaultImageRender(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
  let linkDepth = 0
  for (const previous of tokens.slice(0, idx)) {
    if (previous.type === 'link_open') linkDepth += 1
    if (previous.type === 'link_close') linkDepth -= 1
  }
  if (linkDepth) return image
  const escaped = md.utils.escapeHtml(source)
  const name = md.utils.escapeHtml(token?.content || imageName(source))
  return `<a href="${escaped}" class="markdown-image-attachment" data-image-src="${escaped}" aria-label="查看完整图片：${name}">${image}<span>${name}</span></a>`
}

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!
  const href = token.attrGet('href') || ''
  let end = idx + 1
  while (end < tokens.length && tokens[end]?.type !== 'link_close') end += 1
  const embedded = tokens
    .slice(idx + 1, end)
    .find((item) => item.type === 'image')
    ?.attrGet('src')
  const original = embedded || (/\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(href) ? href : '')
  const source = safeImageSource((env as MarkdownImages).imageOverrides?.[original] || original)
  if (source) {
    token.attrJoin('class', 'markdown-image-attachment')
    token.attrSet('data-image-src', source)
    if (!embedded) token.attrSet('href', source)
    const label = tokens[idx + 1]
    if (!embedded && label?.type === 'text' && tokens[idx + 2]?.type === 'link_close' && (label.content === href || token.info === 'auto')) label.content = imageName(source)
    const open = self.renderToken(tokens, idx, options)
    return embedded ? open : `${open}<img class="markdown-image-thumb" src="${md.utils.escapeHtml(source)}" alt="" loading="lazy" crossorigin="anonymous" />`
  }
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, idx, options)
}

/**
 * 将 Markdown 文本转为安全 HTML
 * @param source 原始 Markdown 文本
 */
export function renderMarkdown(source: string, imageOverrides: Record<string, string> = {}): string {
  if (!source) return ''

  const rawHtml = md.render(source, { imageOverrides } satisfies MarkdownImages)
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['crossorigin', 'target', 'rel'],
  })
}
