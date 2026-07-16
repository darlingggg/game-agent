import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/** Markdown 解析器（单例，避免重复创建） */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

/** 为跨域图片补充 crossorigin，兼容 COEP 页面下的 COS 图片展示 */
const defaultImageRender = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
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
export function renderMarkdown(source: string): string {
  if (!source) return ''

  const rawHtml = md.render(source)
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['crossorigin'],
  })
}
