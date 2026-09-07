import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Input, Select, Tag } from 'animal-island-ui'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import http from '@/api'
import { renderMarkdownDocument } from '@/utils/markdown'
import type { AppViewProps } from '@/apps/registry'
import './BlogPage.css'

interface TaxonomyItem {
  id: number
  name: string
  slug: string
  sortOrder: number
}

interface ArticleSummary {
  id: number
  title: string
  slug: string
  summary: string
  coverImageUrl?: string
  publishedAt?: string
  updatedAt: string
  readingMinutes: number
  category?: TaxonomyItem
  tags: TaxonomyItem[]
}

interface ArticleLink {
  title: string
  slug: string
}

interface ArticleDetail extends ArticleSummary {
  markdown: string
  previous?: ArticleLink
  next?: ArticleLink
}

interface PageData {
  items: ArticleSummary[]
  total: number
  page: number
  pageSize: number
}

interface Taxonomy {
  categories: TaxonomyItem[]
  tags: TaxonomyItem[]
}

function bootstrapArticle(slug?: string): ArticleDetail | null {
  const node = document.getElementById('portal-article-data')
  if (!node?.textContent) return null
  try {
    const article = JSON.parse(node.textContent) as ArticleDetail
    article.tags ??= []
    article.readingMinutes ??= 1
    return !slug || article.slug === slug ? article : null
  } catch {
    return null
  }
}

/** 公开博客应用，以 URL 作为文章、筛选与分页状态的唯一来源。 */
export default function BlogPage({ payload }: AppViewProps) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const routeSlug = decodeURIComponent(location.pathname.match(/^\/blog\/(.+)$/)?.[1] ?? '')
  const initialSlug = routeSlug || (typeof payload?.slug === 'string' ? payload.slug : '')
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ categories: [], tags: [] })
  const [selected, setSelected] = useState<ArticleDetail | null>(() =>
    bootstrapArticle(initialSlug),
  )
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [loading, setLoading] = useState(true)
  const [articleLoading, setArticleLoading] = useState(Boolean(initialSlug && !selected))
  const [error, setError] = useState('')
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const category = searchParams.get('category') ?? ''
  const tag = searchParams.get('tag') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))

  const renderedDocument = useMemo(
    () =>
      renderMarkdownDocument(selected?.markdown ?? '', {
        copyCodeLabel: t('app.blog.copyCode'),
      }),
    [selected?.markdown, t],
  )

  const updateSearch = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(searchParams)
      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value)
        else next.delete(key)
      })
      if (!Object.hasOwn(changes, 'page')) next.delete('page')
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) updateSearch({ q: query })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, searchParams, updateSearch])

  useEffect(() => {
    void http.get<Taxonomy>('/blog/taxonomy').then((response) => {
      if (response.success && response.data) setTaxonomy(response.data)
    })
  }, [])

  const loadArticles = useCallback(async () => {
    setLoading(true)
    setError('')
    const response = await http.get<PageData>('/blog/articles', {
      q: searchParams.get('q') || undefined,
      category: category || undefined,
      tag: tag || undefined,
      page,
      pageSize: 12,
    })
    if (response.success && response.data) setArticles(response.data.items)
    else setError(response.message || t('app.blog.error'))
    setLoading(false)
    return response.data
  }, [category, page, searchParams, t, tag])

  const [pageData, setPageData] = useState<PageData | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadArticles().then((data) => setPageData(data ?? null))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadArticles])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!routeSlug) {
        setSelected(null)
        setArticleLoading(false)
        return
      }
      const bootstrapped = bootstrapArticle(routeSlug)
      if (bootstrapped) {
        setSelected(bootstrapped)
        setArticleLoading(false)
      } else {
        setArticleLoading(true)
      }
      void http
        .get<ArticleDetail>(`/blog/articles/${encodeURIComponent(routeSlug)}`)
        .then((response) => {
          if (response.success && response.data) {
            setSelected(response.data)
            setError('')
          } else {
            setSelected(null)
            setError(response.message || t('app.blog.notFound'))
          }
          setArticleLoading(false)
        })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [routeSlug, t])

  useEffect(() => {
    if (!selected) return
    document.title = selected.title
    const description = globalThis.document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    if (description) description.content = selected.summary
    return () => {
      document.title = 'PortalOS'
    }
  }, [selected])

  function openArticle(slug: string) {
    sessionStorage.setItem('portal_blog_scroll', String(listScrollRef.current?.scrollTop ?? 0))
    navigate({ pathname: `/blog/${encodeURIComponent(slug)}`, search: searchParams.toString() })
  }

  function backToList() {
    navigate({ pathname: '/blog', search: searchParams.toString() })
    window.setTimeout(() => {
      if (listScrollRef.current) {
        listScrollRef.current.scrollTop = Number(sessionStorage.getItem('portal_blog_scroll') ?? 0)
      }
    }, 0)
  }

  const formatDate = (value?: string) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(value))
      : ''

  return (
    <section className={`blog-app ${routeSlug ? 'reader-open' : ''}`}>
      <aside className="blog-sidebar">
        <Card>
          <div className="blog-filters">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              allowClear
              prefix="⌕"
              placeholder={t('app.blog.searchPlaceholder')}
            />
            <Select
              value={category}
              placeholder={t('app.blog.allCategories')}
              options={[
                { label: t('app.blog.allCategories'), key: '' },
                ...taxonomy.categories.map((item) => ({
                  label: item.name,
                  key: String(item.id),
                })),
              ]}
              onChange={(value) => updateSearch({ category: value })}
            />
            <Select
              value={tag}
              placeholder={t('app.blog.allTags')}
              options={[
                { label: t('app.blog.allTags'), key: '' },
                ...taxonomy.tags.map((item) => ({ label: item.name, key: String(item.id) })),
              ]}
              onChange={(value) => updateSearch({ tag: value })}
            />
            {(query || category || tag) && (
              <Button type="text" onClick={() => setSearchParams({})}>
                {t('app.blog.clearFilters')}
              </Button>
            )}
          </div>
        </Card>
        <div ref={listScrollRef} className="blog-list" aria-live="polite">
          {loading && <Card className="island-state">{t('app.blog.loading')}</Card>}
          {!loading && error && !routeSlug && (
            <Card className="island-state">
              {error}
              <Button onClick={() => void loadArticles()}>{t('app.blog.retry')}</Button>
            </Card>
          )}
          {!loading && !error && articles.length === 0 && (
            <Card className="island-state">{t('app.blog.empty')}</Card>
          )}
          {!loading &&
            articles.map((article) => (
              <button
                key={article.id}
                type="button"
                className={`blog-entry-button ${selected?.id === article.id ? 'active' : ''}`}
                onClick={() => openArticle(article.slug)}
              >
                {article.coverImageUrl && (
                  <img src={article.coverImageUrl} alt="" className="blog-entry-cover" />
                )}
                <div className="blog-entry-copy">
                  <strong>{article.title}</strong> · <span>{article.summary}</span>
                </div>
                <small>
                  {formatDate(article.publishedAt)} · {article.readingMinutes}{' '}
                  {t('app.blog.minutes')}
                </small>
              </button>
            ))}
        </div>
        {pageData && pageData.total > pageData.pageSize && (
          <nav className="blog-pagination" aria-label={t('app.blog.pagination')}>
            <Button
              size="small"
              disabled={page <= 1}
              onClick={() => updateSearch({ page: String(page - 1) })}
            >
              ←
            </Button>
            <span>
              {page} / {Math.ceil(pageData.total / pageData.pageSize)}
            </span>
            <Button
              size="small"
              disabled={page * pageData.pageSize >= pageData.total}
              onClick={() => updateSearch({ page: String(page + 1) })}
            >
              →
            </Button>
          </nav>
        )}
      </aside>
      <main className="blog-reader">
        {articleLoading ? (
          <Card className="island-state island-state-large">{t('app.blog.loading')}</Card>
        ) : selected ? (
          <article className="blog-article">
            <header>
              <Button type="text" className="blog-mobile-back" onClick={backToList}>
                ← {t('app.blog.back')}
              </Button>
              <p className="blog-eyebrow">{t('app.blog.islandJournal')}</p>
              <h1>{selected.title}</h1>
              <p className="blog-article-meta">
                {formatDate(selected.publishedAt)} · {selected.readingMinutes}{' '}
                {t('app.blog.minutes')}
              </p>
              <div className="blog-entry-tags">
                {selected.category && (
                  <Tag onClick={() => updateSearch({ category: String(selected.category?.id) })}>
                    {selected.category.name}
                  </Tag>
                )}
                {selected.tags.map((item) => (
                  <Tag key={item.id} onClick={() => updateSearch({ tag: String(item.id) })}>
                    {item.name}
                  </Tag>
                ))}
              </div>
              <Button
                size="small"
                onClick={() => void navigator.clipboard.writeText(window.location.href)}
              >
                {t('app.blog.copyLink')}
              </Button>
            </header>
            {renderedDocument.headings.length > 0 && (
              <nav className="blog-toc" aria-label={t('app.blog.toc')}>
                {renderedDocument.headings.map((heading) => (
                  <a key={heading.id} href={`#${heading.id}`} data-level={heading.level}>
                    {heading.text}
                  </a>
                ))}
              </nav>
            )}
            <div
              className="docs-markdown"
              dangerouslySetInnerHTML={{ __html: renderedDocument.html }}
            />
            <nav className="blog-neighbors" aria-label={t('app.blog.neighbors')}>
              {selected.previous && (
                <Button onClick={() => openArticle(selected.previous!.slug)}>
                  ← {selected.previous.title}
                </Button>
              )}
              {selected.next && (
                <Button onClick={() => openArticle(selected.next!.slug)}>
                  {selected.next.title} →
                </Button>
              )}
            </nav>
          </article>
        ) : (
          <Card className="island-state island-state-large">
            <h2>{error ? t('app.blog.notFound') : t('app.blog.chooseTitle')}</h2>
            <p>{error || t('app.blog.chooseDescription')}</p>
          </Card>
        )}
      </main>
    </section>
  )
}
