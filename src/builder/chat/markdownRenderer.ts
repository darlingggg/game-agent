import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/** Markdown 解析器（单例，避免重复创建） */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

/**
 * 将 Markdown 文本转为安全 HTML
 * @param source 原始 Markdown 文本
 */
export function renderMarkdown(source: string): string {
  if (!source) return ''

  const rawHtml = md.render(source)
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
  })
}
