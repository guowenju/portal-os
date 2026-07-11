import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, Tag } from 'animal-island-ui'
import { useTranslation } from 'react-i18next'
import http from '@/api'
import { renderMarkdown } from '@/utils/markdown'

interface Article {
  id: number
  title: string
  slug: string
  summary: string
  markdown: string
  publishedAt?: string
  categoryIds: number[]
  tagIds: number[]
}
interface PageData {
  items: Article[]
  total: number
  page: number
  pageSize: number
}
interface TaxonomyItem {
  id: number
  name: string
  slug: string
}
interface Taxonomy {
  categories: TaxonomyItem[]
  tags: TaxonomyItem[]
}

/**
 * @description 公开博客应用，提供文章浏览、筛选和安全 Markdown 阅读。
 */
export default function BlogPage() {
  const { t } = useTranslation()
  const [articles, setArticles] = useState<Article[]>([])
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ categories: [], tags: [] })
  const [selected, setSelected] = useState<Article | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const html = useMemo(
    () => renderMarkdown(selected?.markdown ?? '', { copyCodeLabel: t('app.blog.copyCode') }),
    [selected, t],
  )

  const loadTaxonomy = useCallback(async () => {
    const response = await http.get<Taxonomy>('/blog/taxonomy')
    if (response.success && response.data) setTaxonomy(response.data)
  }, [])
  const openArticle = useCallback(async (slug: string) => {
    const response = await http.get<Article>(`/blog/articles/${encodeURIComponent(slug)}`)
    if (response.success && response.data) setSelected(response.data)
  }, [])
  const loadArticles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await http.get<PageData>('/blog/articles', { q: query, pageSize: 50 })
      if (!response.success || !response.data) throw new Error(response.message)
      setArticles(response.data.items)
      if (!selected && response.data.items[0]) await openArticle(response.data.items[0].slug)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('app.blog.error'))
    } finally {
      setLoading(false)
    }
  }, [openArticle, query, selected, t])
  useEffect(() => {
    const timer = window.setTimeout(() => void loadTaxonomy(), 0)
    return () => window.clearTimeout(timer)
  }, [loadTaxonomy])
  useEffect(() => {
    const timer = window.setTimeout(() => void loadArticles(), 250)
    return () => window.clearTimeout(timer)
  }, [loadArticles])
  function nameFor(items: TaxonomyItem[], id: number) {
    return items.find((item) => item.id === id)?.name
  }

  return (
    <section className={`blog-app ${selected ? 'reader-open' : ''}`}>
      <aside className="blog-sidebar">
        <Card title={t('app.blog.journalTitle')}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
            prefix="⌕"
            placeholder={t('app.blog.searchPlaceholder')}
          />
        </Card>
        <div className="blog-list" aria-live="polite">
          {loading && (
            <Card className="island-state">
              <span className="island-state-icon">🌱</span>
              {t('app.blog.loading')}
            </Card>
          )}
          {!loading && error && (
            <Card className="island-state">
              <span className="island-state-icon">🍂</span>
              {error}
              <Button onClick={() => void loadArticles()}>{t('app.blog.retry')}</Button>
            </Card>
          )}
          {!loading && !error && articles.length === 0 && (
            <Card className="island-state">
              <span className="island-state-icon">🏝️</span>
              {t('app.blog.empty')}
            </Card>
          )}
          {!loading &&
            articles.map((article) => (
              <Card
                key={article.id}
                className={`blog-entry-card ${selected?.id === article.id ? 'active' : ''}`}
                onClick={() => void openArticle(article.slug)}
              >
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
                <div className="blog-entry-tags">
                  {article.categoryIds
                    .map((id) => nameFor(taxonomy.categories, id))
                    .filter(Boolean)
                    .map((name) => (
                      <Tag key={name}>{name}</Tag>
                    ))}
                </div>
              </Card>
            ))}
        </div>
      </aside>
      <main className="blog-reader">
        {selected ? (
          <article className="blog-article">
            <header>
              <Button type="text" className="blog-mobile-back" onClick={() => setSelected(null)}>
                ← {t('app.blog.back')}
              </Button>
              <p className="blog-eyebrow">{t('app.blog.islandJournal')}</p>
              <h1>{selected.title}</h1>
              <div className="blog-entry-tags">
                {selected.tagIds
                  .map((id) => nameFor(taxonomy.tags, id))
                  .filter(Boolean)
                  .map((name) => (
                    <Tag key={name}>{name}</Tag>
                  ))}
              </div>
            </header>
            <div className="docs-markdown" dangerouslySetInnerHTML={{ __html: html }} />
          </article>
        ) : (
          <Card className="island-state island-state-large">
            <span className="island-state-icon">📖</span>
            <h2>{t('app.blog.chooseTitle')}</h2>
            <p>{t('app.blog.chooseDescription')}</p>
          </Card>
        )}
      </main>
    </section>
  )
}
