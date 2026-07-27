import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Input,
  Select,
  Table,
  Tabs,
  Tag,
  type TableColumn,
} from 'animal-island-ui'
import { useTranslation } from 'react-i18next'
import http from '@/api'
import { renderMarkdownDocument } from '@/utils/markdown'
import './AdminPage.css'

interface TaxonomyItem {
  id: number
  name: string
  slug: string
  sortOrder: number
}

interface Article {
  [key: string]: unknown
  id: number
  title: string
  slug: string
  summary: string
  markdown: string
  status: 'draft' | 'published'
  publishedAt?: string
  updatedAt: string
  deletedAt?: string
  version: number
  categoryId?: number
  coverMediaId?: number
  tagIds: number[]
}

interface ArticlePage {
  items: Article[]
  total: number
}

interface SessionData {
  username: string
  csrfToken: string
}

interface MediaAsset {
  id: number
  originalName: string
  url: string
  mimeType: string
  byteSize: number
  createdAt: string
}

interface SiteSettings {
  siteName: string
  siteDescription: string
  authorName: string
  siteUrl: string
  defaultShareImageId?: number
  defaultShareImageUrl?: string
  version: number
}

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'offline' | 'conflict'

const snapshotKey = (id: number) => `portal_admin_draft_${id}`

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

/** 单管理员内容后台：文章自动保存、分类标签、图片库与站点设置。 */
export default function AdminPage() {
  const { t } = useTranslation()
  const [session, setSession] = useState<SessionData | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [activeView, setActiveView] = useState('articles')
  const [articles, setArticles] = useState<Article[]>([])
  const [editing, setEditing] = useState<Article | null>(null)
  const [categories, setCategories] = useState<TaxonomyItem[]>([])
  const [tags, setTags] = useState<TaxonomyItem[]>([])
  const [media, setMedia] = useState<MediaAsset[]>([])
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [trash, setTrash] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('clean')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [taxonomyName, setTaxonomyName] = useState('')
  const [taxonomyKind, setTaxonomyKind] = useState<'categories' | 'tags'>('categories')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const headers = useMemo(() => (session ? { 'X-CSRF-Token': session.csrfToken } : {}), [session])
  const preview = useMemo(
    () =>
      renderMarkdownDocument(editing?.markdown ?? '', {
        copyCodeLabel: t('app.admin.copyCode'),
      }),
    [editing?.markdown, t],
  )

  const restoreSession = useCallback(async () => {
    const response = await http.get<SessionData>('/admin/auth/session')
    if (response.success && response.data) setSession(response.data)
  }, [])

  const loadArticles = useCallback(async () => {
    const response = await http.get<ArticlePage>('/admin/articles', { trash, pageSize: 100 })
    if (response.success && response.data) setArticles(response.data.items)
  }, [trash])

  const loadTaxonomy = useCallback(async () => {
    const [categoryResponse, tagResponse] = await Promise.all([
      http.get<TaxonomyItem[]>('/admin/categories'),
      http.get<TaxonomyItem[]>('/admin/tags'),
    ])
    if (categoryResponse.success && categoryResponse.data) setCategories(categoryResponse.data)
    if (tagResponse.success && tagResponse.data) setTags(tagResponse.data)
  }, [])

  const loadMedia = useCallback(async () => {
    const response = await http.get<MediaAsset[]>('/admin/media')
    if (response.success && response.data) setMedia(response.data)
  }, [])

  const loadSettings = useCallback(async () => {
    const response = await http.get<SiteSettings>('/admin/site-settings')
    if (response.success && response.data) setSettings(response.data)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void restoreSession(), 0)
    return () => window.clearTimeout(timer)
  }, [restoreSession])

  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(() => {
      void Promise.all([loadArticles(), loadTaxonomy(), loadMedia(), loadSettings()])
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadArticles, loadMedia, loadSettings, loadTaxonomy, session])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving' || saveState === 'offline') {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveState])

  useEffect(() => {
    const retry = () => {
      if (saveState === 'offline') setSaveState('dirty')
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [saveState])

  const saveArticle = useCallback(
    async (article: Article) => {
      setSaveState('saving')
      const response = await http.put<Article>(
        `/admin/articles/${article.id}`,
        {
          title: article.title,
          slug: article.slug,
          summary: article.summary,
          markdown: article.markdown,
          categoryId: article.categoryId || null,
          coverMediaId: article.coverMediaId || null,
          tagIds: article.tagIds,
          version: article.version,
        },
        { headers },
      )
      if (response.success && response.data) {
        setEditing(response.data)
        localStorage.removeItem(snapshotKey(article.id))
        setSaveState('saved')
        await loadArticles()
      } else if (response.errorCode === 'ARTICLE_VERSION_CONFLICT') {
        setSaveState('conflict')
        setMessage(t('app.admin.versionConflict'))
      } else {
        setSaveState('offline')
        setMessage(response.message)
      }
    },
    [headers, loadArticles, t],
  )

  useEffect(() => {
    if (saveState !== 'dirty' || !editing) return
    localStorage.setItem(
      snapshotKey(editing.id),
      JSON.stringify({ article: editing, savedAt: new Date().toISOString() }),
    )
    const timer = window.setTimeout(() => void saveArticle(editing), 1500)
    return () => window.clearTimeout(timer)
  }, [editing, saveArticle, saveState])

  async function login() {
    setLoading(true)
    const response = await http.post<SessionData>('/admin/auth/login', { username, password })
    setLoading(false)
    if (response.success && response.data) {
      setSession(response.data)
      setPassword('')
      setMessage('')
    } else setMessage(response.message)
  }

  async function logout() {
    if (
      ['dirty', 'saving', 'offline'].includes(saveState) &&
      !window.confirm(t('app.admin.discard'))
    )
      return
    await http.post('/admin/auth/logout', {}, { headers })
    setSession(null)
    setEditing(null)
  }

  function change<K extends keyof Article>(key: K, value: Article[K]) {
    setEditing((current) => {
      if (!current) return current
      const next = { ...current, [key]: value }
      if (
        key === 'title' &&
        typeof value === 'string' &&
        (current.slug.startsWith('draft-') || current.slug === slugify(current.title))
      ) {
        next.slug = slugify(value)
      }
      return next
    })
    setSaveState('dirty')
  }

  async function createArticle() {
    const response = await http.post<Article>('/admin/articles', {}, { headers })
    if (response.success && response.data) {
      setEditing(response.data)
      setSaveState('clean')
      setActiveView('articles')
      await loadArticles()
    } else setMessage(response.message)
  }

  function selectArticle(article: Article) {
    if (
      ['dirty', 'saving', 'offline'].includes(saveState) &&
      !window.confirm(t('app.admin.discard'))
    )
      return
    const raw = localStorage.getItem(snapshotKey(article.id))
    if (raw) {
      try {
        const snapshot = JSON.parse(raw) as { article: Article }
        if (window.confirm(t('app.admin.restoreLocal'))) {
          setEditing(snapshot.article)
          setSaveState('dirty')
          return
        }
        localStorage.removeItem(snapshotKey(article.id))
      } catch {
        localStorage.removeItem(snapshotKey(article.id))
      }
    }
    setEditing(article)
    setSaveState('clean')
  }

  async function reloadConflict(keepLocal: boolean) {
    if (!editing) return
    const local = editing
    const response = await http.get<Article>(`/admin/articles/${editing.id}`)
    if (!response.success || !response.data) return
    setEditing(keepLocal ? { ...local, version: response.data.version } : response.data)
    setSaveState(keepLocal ? 'dirty' : 'clean')
  }

  async function action(name: 'publish' | 'unpublish' | 'restore') {
    if (!editing) return
    const response = await http.post<Article>(
      `/admin/articles/${editing.id}/${name}`,
      { version: editing.version },
      { headers },
    )
    if (response.success && response.data) {
      setEditing(response.data)
      setSaveState('clean')
      await loadArticles()
    }
    setMessage(response.message)
  }

  async function remove(permanent = false) {
    if (
      !editing ||
      !window.confirm(t(permanent ? 'app.admin.confirmPermanent' : 'app.admin.confirmTrash'))
    )
      return
    const response = await http.delete(
      permanent ? `/admin/articles/${editing.id}/permanent` : `/admin/articles/${editing.id}`,
      { version: editing.version },
      { headers },
    )
    setMessage(response.message)
    if (response.success) {
      localStorage.removeItem(snapshotKey(editing.id))
      setEditing(null)
      setSaveState('clean')
      await loadArticles()
    }
  }

  async function createTaxonomy() {
    const response = await http.post<TaxonomyItem>(
      `/admin/${taxonomyKind}`,
      { name: taxonomyName },
      { headers },
    )
    setMessage(response.message)
    if (response.success) {
      setTaxonomyName('')
      await loadTaxonomy()
    }
  }

  async function deleteTaxonomy(kind: 'categories' | 'tags', id: number) {
    if (!window.confirm(t('app.admin.confirmTaxonomyDelete'))) return
    const response = await http.delete(`/admin/${kind}/${id}`, {}, { headers })
    setMessage(response.message)
    if (response.success) await loadTaxonomy()
  }

  async function updateTaxonomy(
    kind: 'categories' | 'tags',
    item: TaxonomyItem,
    changes: Partial<Pick<TaxonomyItem, 'name' | 'sortOrder'>>,
  ) {
    const response = await http.put<TaxonomyItem>(
      `/admin/${kind}/${item.id}`,
      {
        name: changes.name ?? item.name,
        slug: item.slug,
        sortOrder: changes.sortOrder ?? item.sortOrder,
      },
      { headers },
    )
    setMessage(response.message)
    if (response.success) await loadTaxonomy()
  }

  async function uploadImage(file?: File) {
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    setLoading(true)
    const response = await http.upload<MediaAsset>('/admin/media', form, { headers })
    setLoading(false)
    setMessage(response.message)
    if (response.success) await loadMedia()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function deleteImage(id: number) {
    if (!window.confirm(t('app.admin.confirmImageDelete'))) return
    const response = await http.delete(`/admin/media/${id}`, {}, { headers })
    setMessage(response.message)
    if (response.success) await loadMedia()
  }

  function insertImage(item: MediaAsset) {
    if (!editing) {
      setMessage(t('app.admin.chooseArticleFirst'))
      return
    }
    const line = `![${item.originalName}](${item.url})`
    change('markdown', `${editing.markdown}${editing.markdown ? '\n\n' : ''}${line}`)
    setActiveView('articles')
  }

  async function saveSettings() {
    if (!settings) return
    const response = await http.put<SiteSettings>('/admin/site-settings', settings, { headers })
    setMessage(response.message)
    if (response.success && response.data) setSettings(response.data)
  }

  const articleColumns: TableColumn<Article>[] = [
    { title: t('app.admin.title'), dataIndex: 'title' },
    {
      title: t('app.admin.status'),
      render: (_, item) => (
        <Tag
          size="small"
          color={
            item.deletedAt ? 'app-red' : item.status === 'published' ? 'app-green' : 'app-teal'
          }
        >
          {item.deletedAt ? t('app.admin.trashed') : t(`app.admin.${item.status}`)}
        </Tag>
      ),
    },
    {
      title: t('app.admin.actions'),
      render: (_, item) => (
        <Button size="small" onClick={() => selectArticle(item)}>
          {t('app.admin.edit')}
        </Button>
      ),
    },
  ]

  if (!session)
    return (
      <section className="admin-login">
        <Card className="admin-login-card">
          <div className="admin-form">
            <h2>{t('app.admin.loginTitle')}</h2>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t('app.admin.username')}
              allowClear
            />
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder={t('app.admin.password')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void login()
              }}
            />
            {message && <p className="admin-message">{message}</p>}
            <Button type="primary" block loading={loading} onClick={() => void login()}>
              {t('app.admin.login')}
            </Button>
          </div>
        </Card>
      </section>
    )

  const editor = editing ? (
    <div className="admin-editor-pane">
      <Input
        value={editing.title}
        onChange={(event) => change('title', event.target.value)}
        placeholder={t('app.admin.articleTitle')}
      />
      <Input
        value={editing.slug}
        onChange={(event) => change('slug', event.target.value)}
        placeholder={t('app.admin.slug')}
      />
      <textarea
        className="admin-summary"
        value={editing.summary}
        onChange={(event) => change('summary', event.target.value)}
        placeholder={t('app.admin.summary')}
      />
      <div className="admin-taxonomy-fields">
        <Select
          value={editing.categoryId ? String(editing.categoryId) : ''}
          onChange={(value) => change('categoryId', value ? Number(value) : undefined)}
          options={[
            { key: '', label: t('app.admin.noCategory') },
            ...categories.map((item) => ({ key: String(item.id), label: item.name })),
          ]}
          placeholder={t('app.admin.noCategory')}
        />
        <Checkbox
          value={editing.tagIds}
          options={tags.map((item) => ({ value: item.id, label: item.name }))}
          onChange={(values) => change('tagIds', values.map(Number))}
        />
        <Select
          value={editing.coverMediaId ? String(editing.coverMediaId) : ''}
          onChange={(value) => change('coverMediaId', value ? Number(value) : undefined)}
          options={[
            { key: '', label: t('app.admin.noCover') },
            ...media.map((item) => ({ key: String(item.id), label: item.originalName })),
          ]}
          placeholder={t('app.admin.noCover')}
        />
      </div>
      <textarea
        className="admin-markdown"
        value={editing.markdown}
        onChange={(event) => change('markdown', event.target.value)}
        placeholder={t('app.admin.markdown')}
      />
    </div>
  ) : null

  const articleView = (
    <div className="admin-workspace">
      <aside className="admin-list">
        <div className="admin-list-actions">
          <Button type="primary" onClick={() => void createArticle()}>
            {t('app.admin.newArticle')}
          </Button>
          <Button
            onClick={() => {
              setTrash((value) => !value)
              setEditing(null)
            }}
          >
            {trash ? t('app.admin.backArticles') : t('app.admin.trash')}
          </Button>
        </div>
        <Table
          columns={articleColumns as TableColumn<Record<string, unknown>>[]}
          dataSource={articles}
          rowKey="id"
          emptyText={t('app.admin.empty')}
        />
      </aside>
      <main className="admin-detail">
        {editing ? (
          <>
            <div className="admin-savebar">
              <Tag color={saveState === 'conflict' ? 'app-red' : 'app-teal'}>
                {t(`app.admin.saveState.${saveState}`)}
              </Tag>
              {saveState === 'conflict' && (
                <>
                  <Button onClick={() => void reloadConflict(false)}>
                    {t('app.admin.useServer')}
                  </Button>
                  <Button onClick={() => void reloadConflict(true)}>
                    {t('app.admin.keepLocal')}
                  </Button>
                </>
              )}
              {!editing.deletedAt && (
                <Button
                  onClick={() =>
                    void action(editing.status === 'published' ? 'unpublish' : 'publish')
                  }
                  disabled={saveState === 'dirty' || saveState === 'saving'}
                >
                  {t(editing.status === 'published' ? 'app.admin.unpublish' : 'app.admin.publish')}
                </Button>
              )}
              {editing.deletedAt ? (
                <>
                  <Button onClick={() => void action('restore')}>{t('app.admin.restore')}</Button>
                  <Button danger onClick={() => void remove(true)}>
                    {t('app.admin.permanentDelete')}
                  </Button>
                </>
              ) : (
                <Button danger onClick={() => void remove()}>
                  {t('app.admin.delete')}
                </Button>
              )}
            </div>
            <div className="admin-editor-desktop">
              {editor}
              <article
                className="admin-preview docs-markdown"
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            </div>
            <div className="admin-editor-mobile">
              <Tabs
                items={[
                  { key: 'edit', label: t('app.admin.edit'), children: editor },
                  {
                    key: 'preview',
                    label: t('app.admin.preview'),
                    children: (
                      <article
                        className="admin-preview docs-markdown"
                        dangerouslySetInnerHTML={{ __html: preview.html }}
                      />
                    ),
                  },
                ]}
              />
            </div>
          </>
        ) : (
          <Card className="island-state island-state-large">{t('app.admin.choose')}</Card>
        )}
      </main>
    </div>
  )

  const taxonomyView = (
    <section className="admin-section admin-taxonomy-section">
      <div className="admin-inline-form">
        <Select
          value={taxonomyKind}
          onChange={(value) => setTaxonomyKind(value as 'categories' | 'tags')}
          options={[
            { key: 'categories', label: t('app.admin.categories') },
            { key: 'tags', label: t('app.admin.tags') },
          ]}
        />
        <Input
          value={taxonomyName}
          onChange={(event) => setTaxonomyName(event.target.value)}
          placeholder={t('app.admin.taxonomyName')}
        />
        <Button
          type="primary"
          className="admin-taxonomy-create"
          onClick={() => void createTaxonomy()}
        >
          {t('app.admin.create')}
        </Button>
      </div>
      <div className="admin-taxonomy-list">
        {(taxonomyKind === 'categories' ? categories : tags).map((item) => (
          <Card key={item.id}>
            <strong>{item.name}</strong>
            <small>/{item.slug}</small>
            <Button
              size="small"
              onClick={() => {
                const name = window.prompt(t('app.admin.taxonomyName'), item.name)
                if (name?.trim()) void updateTaxonomy(taxonomyKind, item, { name })
              }}
            >
              {t('app.admin.edit')}
            </Button>
            <Button
              type="text"
              size="small"
              aria-label={t('app.admin.actions')}
              onClick={() =>
                void updateTaxonomy(taxonomyKind, item, { sortOrder: item.sortOrder - 1 })
              }
            >
              ↑
            </Button>
            <Button
              type="text"
              size="small"
              aria-label={t('app.admin.actions')}
              onClick={() =>
                void updateTaxonomy(taxonomyKind, item, { sortOrder: item.sortOrder + 1 })
              }
            >
              ↓
            </Button>
            <Button danger size="small" onClick={() => void deleteTaxonomy(taxonomyKind, item.id)}>
              {t('app.admin.delete')}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  )

  const mediaView = (
    <section className="admin-section">
      <input
        ref={fileInputRef}
        className="admin-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(event) => void uploadImage(event.target.files?.[0])}
      />
      <Button type="primary" loading={loading} onClick={() => fileInputRef.current?.click()}>
        {t('app.admin.uploadImage')}
      </Button>
      <div className="admin-media-grid">
        {media.map((item) => (
          <Card key={item.id}>
            <img src={item.url} alt={item.originalName} />
            <strong>{item.originalName}</strong>
            <small>{(item.byteSize / 1024).toFixed(1)} KiB</small>
            <div className="admin-media-actions">
              <Button size="small" onClick={() => insertImage(item)}>
                {t('app.admin.insertImage')}
              </Button>
              <Button
                size="small"
                onClick={() =>
                  void navigator.clipboard.writeText(new URL(item.url, location.href).href)
                }
              >
                {t('app.admin.copyUrl')}
              </Button>
              <Button danger size="small" onClick={() => void deleteImage(item.id)}>
                {t('app.admin.delete')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )

  const settingsView = settings ? (
    <section className="admin-section admin-settings-form">
      <Input
        value={settings.siteName}
        onChange={(event) => setSettings({ ...settings, siteName: event.target.value })}
        placeholder={t('app.admin.siteName')}
      />
      <textarea
        value={settings.siteDescription}
        onChange={(event) => setSettings({ ...settings, siteDescription: event.target.value })}
        placeholder={t('app.admin.siteDescription')}
      />
      <Input
        value={settings.authorName}
        onChange={(event) => setSettings({ ...settings, authorName: event.target.value })}
        placeholder={t('app.admin.authorName')}
      />
      <Input
        value={settings.siteUrl}
        onChange={(event) => setSettings({ ...settings, siteUrl: event.target.value })}
        placeholder={t('app.admin.siteUrl')}
      />
      <Select
        value={settings.defaultShareImageId ? String(settings.defaultShareImageId) : ''}
        onChange={(value) =>
          setSettings({ ...settings, defaultShareImageId: value ? Number(value) : undefined })
        }
        options={[
          { key: '', label: t('app.admin.noShareImage') },
          ...media.map((item) => ({ key: String(item.id), label: item.originalName })),
        ]}
        placeholder={t('app.admin.noShareImage')}
      />
      <Button type="primary" onClick={() => void saveSettings()}>
        {t('app.admin.saveSettings')}
      </Button>
    </section>
  ) : null

  return (
    <section className="admin-app">
      <header className="admin-toolbar">
        <div>
          <strong>{t('app.admin.welcome', { name: session.username })}</strong>
          {message && <span className="admin-message">{message}</span>}
        </div>
        <Button type="text" onClick={() => void logout()}>
          {t('app.admin.logout')}
        </Button>
      </header>
      <Tabs
        className="admin-main-tabs"
        activeKey={activeView}
        onChange={setActiveView}
        items={[
          { key: 'articles', label: t('app.admin.articles'), children: articleView },
          { key: 'taxonomy', label: t('app.admin.taxonomy'), children: taxonomyView },
          { key: 'media', label: t('app.admin.media'), children: mediaView },
          { key: 'settings', label: t('app.admin.siteSettings'), children: settingsView },
        ]}
      />
    </section>
  )
}
