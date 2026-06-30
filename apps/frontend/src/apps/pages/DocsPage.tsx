import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card } from 'animal-island-ui'
import http from '@/api'
import { renderMarkdown } from '@/utils/markdown'

interface DocArticleSummary {
  slug: string
  title: string
  categories: string[]
}

interface DocArticleDetail extends DocArticleSummary {
  markdown: string
}

interface DocArticleListData {
  items: DocArticleSummary[]
  total: number
  page: number
  pageSize: number
}

interface DocBootstrapData {
  articles: DocArticleSummary[]
  initialArticle: DocArticleDetail | null
}

interface DocsTreeNode {
  key: string
  title: string
  depth: number
  number: string
  children: DocsTreeNode[]
  article?: DocArticleSummary
}

/**
 * @description 只读文档应用，提供章节树、搜索和 Markdown 阅读体验。
 */
export default function DocsPage() {
  const { t } = useTranslation()
  const [articles, setArticles] = useState<DocArticleSummary[]>([])
  const [searchResults, setSearchResults] = useState<DocArticleSummary[]>([])
  const [selectedArticle, setSelectedArticle] = useState<DocArticleDetail | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingArticle, setLoadingArticle] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchPerformed, setSearchPerformed] = useState(false)
  const [searchResultTotal, setSearchResultTotal] = useState(0)
  const [searchErrorMessage, setSearchErrorMessage] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<string>>(new Set())
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const searchRequestId = useRef(0)
  const latestSearchKeyword = useRef('')
  const markdownReaderRef = useRef<HTMLDivElement | null>(null)
  const pointerHandledCopyButton = useRef<HTMLButtonElement | null>(null)
  const activeCopyButton = useRef<HTMLButtonElement | null>(null)
  const copyFeedbackTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  const activeArticleSlug = selectedArticle?.slug ?? ''
  const hasArticles = articles.length > 0
  const showSearchPopover =
    searchOpen && (searching || searchPerformed || Boolean(searchErrorMessage))
  const readerHtml = useMemo(
    () =>
      renderMarkdown(selectedArticle?.markdown ?? '', {
        copyCodeLabel: t('app.docs.copyCode'),
        resolveAssetUrl: (url) => resolveArticleAssetUrl(url, selectedArticle?.slug ?? ''),
      }),
    [selectedArticle?.markdown, selectedArticle?.slug, t],
  )
  const docsTreeRows = useMemo(() => {
    const roots: DocsTreeNode[] = []
    articles.forEach((article) => {
      appendArticleToTree(roots, article)
    })
    return flattenVisibleTree(roots, expandedCategoryKeys)
  }, [articles, expandedCategoryKeys])

  const resetFilters = useCallback(() => {
    searchRequestId.current += 1
    latestSearchKeyword.current = ''
    setSearchKeyword('')
    setSearchResults([])
    setSearchResultTotal(0)
    setSearchPerformed(false)
    setSearchErrorMessage('')
    setSearching(false)
    clearSearchTimer(searchTimer)
  }, [])

  const loadArticle = useCallback(
    async (slug: string) => {
      if (loadingArticle || activeArticleSlug === slug) return
      setLoadingArticle(true)
      setErrorMessage('')
      try {
        const response = await http.get<DocArticleDetail>(
          `/docs/articles/${toArticleEndpoint(slug)}`,
        )
        if (!response.success || !response.data) {
          throw new Error(response.message || t('app.docs.errorArticle'))
        }
        setSelectedArticle(response.data)
      } catch (error) {
        setSelectedArticle(null)
        setErrorMessage(error instanceof Error ? error.message : t('app.docs.errorArticle'))
      } finally {
        setLoadingArticle(false)
      }
    },
    [activeArticleSlug, loadingArticle, t],
  )

  const selectArticle = useCallback(
    async (article: DocArticleSummary) => {
      setExpandedCategoryKeys(new Set(categoryAncestorKeys(article.categories.join('/'))))
      await loadArticle(article.slug)
    },
    [loadArticle],
  )

  async function selectTreeNodeTitle(row: DocsTreeNode) {
    setExpandedCategoryKeys(new Set(categoryAncestorKeys(row.key)))
    if (row.article) {
      await loadArticle(row.article.slug)
    }
  }

  async function selectSearchResult(article: DocArticleSummary) {
    await selectArticle(article)
    setSearchOpen(false)
  }

  async function toggleSearch() {
    setSearchOpen((open) => !open)
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  const searchArticleContent = useCallback(
    async (keyword: string) => {
      if (!keyword) {
        resetFilters()
        return
      }

      const requestId = searchRequestId.current + 1
      searchRequestId.current = requestId
      setSearching(true)
      setSearchPerformed(true)
      setSearchErrorMessage('')
      try {
        const response = await http.get<DocArticleListData>('/docs/search', {
          q: keyword,
          page: 1,
          page_size: 200,
        })
        if (!response.success || !response.data) {
          throw new Error(response.message || t('app.docs.errorList'))
        }
        if (requestId !== searchRequestId.current || keyword !== latestSearchKeyword.current) return
        setSearchResults(response.data.items)
        setSearchResultTotal(response.data.total)
      } catch (error) {
        if (requestId !== searchRequestId.current || keyword !== latestSearchKeyword.current) return
        setSearchResults([])
        setSearchResultTotal(0)
        setSearchErrorMessage(error instanceof Error ? error.message : t('app.docs.errorList'))
      } finally {
        if (requestId === searchRequestId.current && keyword === latestSearchKeyword.current) {
          setSearching(false)
        }
      }
    },
    [resetFilters, t],
  )

  function handleSearchKeywordChange(value: string) {
    const keyword = value.trim()
    latestSearchKeyword.current = keyword
    if (!keyword) {
      resetFilters()
      return
    }
    setSearchKeyword(keyword)
  }

  function toggleCategory(key: string) {
    setExpandedCategoryKeys((keys) => {
      const nextKeys = new Set(keys)
      if (nextKeys.has(key)) {
        nextKeys.delete(key)
      } else {
        nextKeys.add(key)
      }
      return nextKeys
    })
  }

  function findCopyCodeButton(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null
    return target?.closest<HTMLButtonElement>('.docs-copy-code') ?? null
  }

  async function copyCodeBlock(button: HTMLButtonElement) {
    if (!button) return

    const code = button.closest('.docs-code-block')?.querySelector('pre code')?.textContent ?? ''
    if (!code) return
    // 复制会触发窗口聚焦和 React 提交，先记录索引用于回到当前 DOM 更新反馈。
    const codeBlockIndex = resolveCodeBlockIndex(button)

    try {
      await navigator.clipboard.writeText(code)
      showCopyButtonFeedback(button, codeBlockIndex)
    } catch (error) {
      console.warn('复制代码块失败', error)
    }
  }

  function showCopyButtonFeedback(sourceButton: HTMLButtonElement, codeBlockIndex: number) {
    const button = resolveCurrentCopyButton(sourceButton, codeBlockIndex)

    if (copyFeedbackTimer.current) {
      window.clearTimeout(copyFeedbackTimer.current)
      copyFeedbackTimer.current = null
    }
    if (activeCopyButton.current && activeCopyButton.current !== button) {
      activeCopyButton.current.textContent = '⧉'
    }

    activeCopyButton.current = button
    button.textContent = '✓'
    copyFeedbackTimer.current = window.setTimeout(() => {
      button.textContent = '⧉'
      if (activeCopyButton.current === button) {
        activeCopyButton.current = null
      }
      copyFeedbackTimer.current = null
    }, 1200)
  }

  function resolveCodeBlockIndex(button: HTMLButtonElement) {
    const reader = markdownReaderRef.current
    const codeBlock = button.closest('.docs-code-block')
    if (!reader || !codeBlock) return -1

    const codeBlocks = Array.from(reader.querySelectorAll('.docs-code-block'))
    return codeBlocks.indexOf(codeBlock)
  }

  function resolveCurrentCopyButton(sourceButton: HTMLButtonElement, codeBlockIndex: number) {
    const reader = markdownReaderRef.current
    const codeBlocks = reader ? Array.from(reader.querySelectorAll('.docs-code-block')) : []
    const currentCodeBlock = codeBlocks[codeBlockIndex]
    const currentButton = currentCodeBlock?.querySelector<HTMLButtonElement>('.docs-copy-code')

    return currentButton ?? sourceButton
  }

  async function handleMarkdownPointerDown(event: PointerEvent<HTMLElement>) {
    // 桌面端 click 可能晚于窗口聚焦导致剪贴板失焦，鼠标按下时立即复制。
    if (event.pointerType !== 'mouse') return

    const button = findCopyCodeButton(event)
    if (!button) return

    pointerHandledCopyButton.current = button
    await copyCodeBlock(button)
  }

  async function handleMarkdownPointerUp(event: PointerEvent<HTMLElement>) {
    // 触摸端按下时的反馈可能被松开后的 DOM 提交覆盖，改在松开时复制。
    if (event.pointerType === 'mouse') return

    const button = findCopyCodeButton(event)
    if (!button) return

    pointerHandledCopyButton.current = button
    await copyCodeBlock(button)
  }

  async function handleMarkdownClick(event: MouseEvent<HTMLElement>) {
    const button = findCopyCodeButton(event)
    if (!button) return

    if (pointerHandledCopyButton.current === button) {
      pointerHandledCopyButton.current = null
      return
    }

    await copyCodeBlock(button)
  }

  useEffect(() => {
    let active = true
    async function loadBootstrap() {
      setLoadingList(true)
      setErrorMessage('')
      try {
        const response = await http.get<DocBootstrapData>('/docs/bootstrap')
        if (!response.success || !response.data) {
          throw new Error(response.message || t('app.docs.errorList'))
        }
        if (!active) return
        setArticles(response.data.articles)
        setSelectedArticle(response.data.initialArticle)
        if (response.data.initialArticle) {
          setExpandedCategoryKeys(
            new Set(categoryAncestorKeys(response.data.initialArticle.categories.join('/'))),
          )
        }
      } catch (error) {
        if (!active) return
        setArticles([])
        setSelectedArticle(null)
        setErrorMessage(error instanceof Error ? error.message : t('app.docs.errorList'))
      } finally {
        if (active) {
          setLoadingList(false)
          setBootstrapping(false)
        }
      }
    }
    void loadBootstrap()
    return () => {
      active = false
    }
  }, [t])

  useEffect(() => {
    clearSearchTimer(searchTimer)
    const keyword = searchKeyword.trim()
    if (!keyword) return

    searchTimer.current = window.setTimeout(() => {
      void searchArticleContent(keyword)
    }, 250)

    return () => clearSearchTimer(searchTimer)
  }, [searchArticleContent, searchKeyword])

  return (
    <section className={`docs-app ${selectedArticle ? 'reader-open' : ''}`}>
      <aside className="docs-sidebar" aria-label={t('app.docs.chapterTree')}>
        <nav className="docs-summary" aria-live="polite">
          {loadingList && <div className="docs-state">{t('app.docs.loadingList')}</div>}
          {!loadingList && !hasArticles && (
            <div className="docs-state">
              <p>{t('app.docs.emptyList')}</p>
              <Button onClick={resetFilters}>{t('app.docs.clearSearch')}</Button>
            </div>
          )}
          {!loadingList && hasArticles && (
            <ol className="docs-tree">
              {docsTreeRows.map((row) => (
                <li
                  key={row.key}
                  className="docs-tree-row"
                  style={{ paddingLeft: `${row.depth * 14}px` }}
                >
                  {row.article && row.children.length === 0 ? (
                    <button
                      type="button"
                      className={`docs-chapter-link ${
                        activeArticleSlug === row.article.slug ? 'active' : ''
                      }`}
                      onClick={() => void selectArticle(row.article!)}
                    >
                      <span className="docs-chapter-title">
                        {row.number ? `${row.number}.${row.title}` : row.title}
                      </span>
                      <span className="docs-tree-spacer" aria-hidden="true" />
                    </button>
                  ) : (
                    <div
                      className={`docs-category ${
                        row.article?.slug === activeArticleSlug ? 'active' : ''
                      }`}
                      aria-expanded={expandedCategoryKeys.has(row.key)}
                    >
                      <button
                        type="button"
                        className="docs-category-title"
                        onClick={() => void selectTreeNodeTitle(row)}
                      >
                        {row.number}.{row.title}
                      </button>
                      {row.children.length > 0 ? (
                        <button
                          type="button"
                          className="docs-category-caret"
                          aria-label={
                            expandedCategoryKeys.has(row.key)
                              ? t('app.docs.collapseChapter')
                              : t('app.docs.expandChapter')
                          }
                          onClick={() => toggleCategory(row.key)}
                        />
                      ) : (
                        <span className="docs-tree-spacer" aria-hidden="true" />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </nav>
      </aside>

      <main className="docs-reader">
        {errorMessage && <div className="docs-error">{errorMessage}</div>}
        {!errorMessage && bootstrapping && (
          <div className="docs-state docs-reader-loading">
            <span className="docs-loading-spinner" aria-hidden="true" />
            <span>{t('app.docs.loadingArticle')}</span>
          </div>
        )}
        {!errorMessage && !bootstrapping && selectedArticle && (
          <>
            <header className="docs-article-header">
              <div className="docs-article-tools">
                <button
                  type="button"
                  className={`docs-search-toggle ${searchOpen || searchKeyword ? 'active' : ''}`}
                  aria-label={t('app.docs.search')}
                  onClick={() => void toggleSearch()}
                >
                  ⌕
                </button>
                {searchOpen && (
                  <Card className="docs-search-popover" aria-live="polite">
                    <div className="docs-search-field">
                      <input
                        ref={searchInputRef}
                        value={searchKeyword}
                        className="docs-header-search"
                        type="text"
                        aria-label={t('app.docs.search')}
                        placeholder={t('app.docs.searchPlaceholder')}
                        onChange={(event) => handleSearchKeywordChange(event.target.value)}
                      />
                      {searchKeyword && (
                        <button
                          type="button"
                          className="docs-search-field-clear"
                          aria-label={t('app.docs.clearSearch')}
                          onClick={resetFilters}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {showSearchPopover && (
                      <>
                        <div className="docs-search-results-header">
                          <strong>{t('app.docs.searchResults')}</strong>
                          {searchPerformed && !searching && (
                            <span>
                              {t('app.docs.searchResultCount', { count: searchResultTotal })}
                            </span>
                          )}
                        </div>
                        {searching && (
                          <div className="docs-search-results-state">{t('app.docs.searching')}</div>
                        )}
                        {!searching && searchErrorMessage && (
                          <div className="docs-search-results-state">{searchErrorMessage}</div>
                        )}
                        {!searching && !searchErrorMessage && searchResults.length === 0 && (
                          <div className="docs-search-results-state">
                            {t('app.docs.emptySearchResults')}
                          </div>
                        )}
                        {!searching && !searchErrorMessage && searchResults.length > 0 && (
                          <ol className="docs-search-results-list">
                            {searchResults.map((result) => (
                              <li key={result.slug}>
                                <button
                                  type="button"
                                  className={`docs-search-result ${
                                    activeArticleSlug === result.slug ? 'active' : ''
                                  }`}
                                  onClick={() => void selectSearchResult(result)}
                                >
                                  <span>{result.title}</span>
                                  {result.categories.length > 0 && (
                                    <small>{result.categories.join(' / ')}</small>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </>
                    )}
                  </Card>
                )}
              </div>
            </header>
            <article className="docs-article">
              {loadingArticle ? (
                <div className="docs-state">{t('app.docs.loadingArticle')}</div>
              ) : (
                <div
                  ref={markdownReaderRef}
                  className="docs-markdown"
                  onPointerDown={(event) => void handleMarkdownPointerDown(event)}
                  onPointerUp={(event) => void handleMarkdownPointerUp(event)}
                  onClick={(event) => void handleMarkdownClick(event)}
                  dangerouslySetInnerHTML={{ __html: readerHtml }}
                />
              )}
            </article>
          </>
        )}
        {!errorMessage && !bootstrapping && !selectedArticle && (
          <div className="docs-empty-reader">
            <h2>{t('app.docs.emptyReaderTitle')}</h2>
            <p>{t('app.docs.emptyReaderDescription')}</p>
          </div>
        )}
      </main>
    </section>
  )
}

function clearSearchTimer(
  searchTimer: ReturnType<typeof useRef<ReturnType<typeof window.setTimeout> | null>>,
) {
  if (!searchTimer.current) return
  window.clearTimeout(searchTimer.current)
  searchTimer.current = null
}

function toArticleEndpoint(slug: string) {
  return slug
    .replace(/^\/+/, '')
    .split('/')
    .map((item) => encodeURIComponent(item))
    .join('/')
}

function resolveArticleAssetUrl(url: string, articleSlug: string) {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('/')) {
    return url
  }

  const [path, suffix = ''] = url.split(/([?#].*)/, 2)
  const baseParts = articleSlug.replace(/^\/+/, '').split('/').slice(0, -1)
  const resolvedParts: string[] = []
  ;[...baseParts, ...path.split('/')].forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') {
      resolvedParts.pop()
      return
    }
    resolvedParts.push(part)
  })

  return `/api/v1/docs/assets/${resolvedParts.map(encodePathSegment).join('/')}${suffix}`
}

function encodePathSegment(value: string) {
  try {
    return encodeURIComponent(decodeURIComponent(value))
  } catch {
    return encodeURIComponent(value)
  }
}

function appendArticleToTree(roots: DocsTreeNode[], article: DocArticleSummary) {
  if (isCategoryIndexArticle(article)) {
    appendCategoryArticleToTree(roots, article)
    return
  }

  let level = roots
  const numberParts: number[] = []
  article.categories.forEach((_, index) => {
    const node = ensureCategoryNode(level, article.categories.slice(0, index + 1), numberParts)
    numberParts.push(Number(node.number.split('.').at(-1) ?? 1))
    level = node.children
  })

  const articleIndex = nextTreeIndex(level)
  const number = article.slug === '/index' ? '' : [...numberParts, articleIndex].join('.')
  level.push({
    key: article.slug,
    title: article.title,
    depth: article.categories.length,
    number,
    children: [],
    article,
  })
}

function isCategoryIndexArticle(article: DocArticleSummary) {
  return article.slug !== '/index' && article.slug.endsWith('/index')
}

function appendCategoryArticleToTree(roots: DocsTreeNode[], article: DocArticleSummary) {
  let level = roots
  const numberParts: number[] = []
  const categoryPath = [...article.categories, article.title]
  categoryPath.forEach((_, index) => {
    const node = ensureCategoryNode(level, categoryPath.slice(0, index + 1), numberParts)
    if (index === categoryPath.length - 1) {
      node.article = article
    }
    numberParts.push(Number(node.number.split('.').at(-1) ?? 1))
    level = node.children
  })
}

function ensureCategoryNode(level: DocsTreeNode[], categoryPath: string[], numberParts: number[]) {
  const key = categoryPath.join('/')
  let node = level.find((item) => item.key === key)
  if (!node) {
    const categoryIndex = nextTreeIndex(level)
    node = {
      key,
      title: categoryPath.at(-1) ?? '',
      depth: categoryPath.length - 1,
      number: [...numberParts, categoryIndex].join('.'),
      children: [],
    }
    level.push(node)
  }
  return node
}

function nextTreeIndex(level: DocsTreeNode[]) {
  return level.filter((node) => node.number).length + 1
}

function flattenVisibleTree(nodes: DocsTreeNode[], expandedCategoryKeys: Set<string>) {
  const rows: DocsTreeNode[] = []
  nodes.forEach((node) => {
    rows.push(node)
    if (node.children.length > 0 && expandedCategoryKeys.has(node.key)) {
      rows.push(...flattenVisibleTree(node.children, expandedCategoryKeys))
    }
  })
  return rows
}

function categoryAncestorKeys(key: string) {
  if (!key) return []
  const parts = key.split('/')
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}
