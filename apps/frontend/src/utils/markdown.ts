import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import type { RenderRule } from 'markdown-it/lib/renderer.mjs'

/**
 * @file markdown.ts
 * @description 提供只读文档使用的受控 Markdown 渲染能力。
 */

/**
 * @description 转义代码高亮兜底输出。
 * @param value 原始代码文本。
 * @returns 转义后的 HTML 文本。
 */
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code: string, language: string): string {
    const normalizedLanguage = language.trim()
    if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
      return hljs.highlight(code, {
        language: normalizedLanguage,
        ignoreIllegals: true,
      }).value
    }
    return escapeHtml(code)
  },
})
markdown.enable(['table', 'strikethrough'])

const defaultLinkOpenRenderer: RenderRule =
  markdown.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
const defaultFenceRenderer: RenderRule =
  markdown.renderer.rules.fence ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
const defaultImageRenderer: RenderRule =
  markdown.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

interface MarkdownRenderEnv {
  copyCodeLabel?: string
  resolveAssetUrl?: (url: string) => string
}

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noreferrer')
  return defaultLinkOpenRenderer(tokens, idx, options, env, self)
}

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const renderEnv = env as MarkdownRenderEnv
  const src = token.attrGet('src')
  if (src && renderEnv.resolveAssetUrl) {
    token.attrSet('src', renderEnv.resolveAssetUrl(src))
  }
  return defaultImageRenderer(tokens, idx, options, env, self)
}

markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const language = token.info.trim().split(/\s+/)[0]
  const languageLabel = language || 'text'
  const renderedCode = defaultFenceRenderer(tokens, idx, options, env, self)
  const renderEnv = env as MarkdownRenderEnv
  const copyCodeLabel = renderEnv.copyCodeLabel || 'Copy code'

  return `<div class="docs-code-block" data-code-language="${markdown.utils.escapeHtml(
    languageLabel,
  )}"><div class="docs-code-toolbar"><span>${markdown.utils.escapeHtml(
    languageLabel,
  )}</span><button type="button" class="docs-copy-code" aria-label="${markdown.utils.escapeHtml(
    copyCodeLabel,
  )}">⧉</button></div>${renderedCode}</div>`
}

/**
 * @description 将 Markdown 转换成受控 HTML。
 * @param content Markdown 正文。
 * @param env 渲染上下文。
 * @returns 可用于 v-html 的 HTML。
 */
export function renderMarkdown(content: string, env: MarkdownRenderEnv = {}) {
  return markdown.render(content, env)
}
