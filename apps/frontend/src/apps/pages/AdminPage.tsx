import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, Table, Tabs, Tag, type TableColumn } from 'animal-island-ui'
import { useTranslation } from 'react-i18next'
import http from '@/api'
import { renderMarkdown } from '@/utils/markdown'

interface Article {
  [key: string]: unknown
  id: number
  title: string
  slug: string
  summary: string
  markdown: string
  status: string
  version: number
  deletedAt?: string
  categoryIds: number[]
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

const emptyArticle: Article = {
  id: 0,
  title: '',
  slug: '',
  summary: '',
  markdown: '',
  status: 'draft',
  version: 0,
  categoryIds: [],
  tagIds: [],
}

/**
 * @description 单管理员后台应用，完成文章草稿、预览、发布和回收站管理。
 */
export default function AdminPage() {
  const { t } = useTranslation()
  const [session, setSession] = useState<SessionData | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [editing, setEditing] = useState<Article | null>(null)
  const [dirty, setDirty] = useState(false)
  const [trash, setTrash] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const preview = useMemo(
    () => renderMarkdown(editing?.markdown ?? '', { copyCodeLabel: t('app.admin.copyCode') }),
    [editing?.markdown, t],
  )
  const headers = session ? { 'X-CSRF-Token': session.csrfToken } : {}
  const restoreSession = useCallback(async () => {
    const response = await http.get<SessionData>('/admin/auth/session')
    if (response.success && response.data) setSession(response.data)
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void restoreSession(), 0)
    return () => window.clearTimeout(timer)
  }, [restoreSession])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function login() {
    setLoading(true)
    const response = await http.post<SessionData>('/admin/auth/login', { username, password })
    setLoading(false)
    if (response.success && response.data) {
      setSession(response.data)
      setPassword('')
    } else setMessage(response.message)
  }
  async function logout() {
    await http.post('/admin/auth/logout', {}, { headers })
    setSession(null)
    setEditing(null)
  }
  const loadArticles = useCallback(async () => {
    const response = await http.get<ArticlePage>('/admin/articles', { trash, pageSize: 100 })
    if (response.success && response.data) setArticles(response.data.items)
  }, [trash])
  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(() => void loadArticles(), 0)
    return () => window.clearTimeout(timer)
  }, [loadArticles, session])
  function change<K extends keyof Article>(key: K, value: Article[K]) {
    setEditing((current) => (current ? { ...current, [key]: value } : current))
    setDirty(true)
  }
  async function save() {
    if (!editing) return
    const body = {
      title: editing.title,
      slug: editing.slug || undefined,
      summary: editing.summary,
      markdown: editing.markdown,
      categoryIds: editing.categoryIds,
      tagIds: editing.tagIds,
      version: editing.id ? editing.version : undefined,
    }
    const response = editing.id
      ? await http.put<Article>(`/admin/articles/${editing.id}`, body, { headers })
      : await http.post<Article>('/admin/articles', body, { headers })
    if (response.success && response.data) {
      setEditing(response.data)
      setDirty(false)
      setMessage(response.message)
      await loadArticles()
    } else setMessage(response.message)
  }
  async function action(name: 'publish' | 'unpublish' | 'restore') {
    if (!editing) return
    const response = await http.post<Article>(
      `/admin/articles/${editing.id}/${name}`,
      {},
      { headers },
    )
    if (response.success && response.data) {
      setEditing(response.data)
      setDirty(false)
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
      {},
      { headers },
    )
    setMessage(response.message)
    if (response.success) {
      setEditing(null)
      setDirty(false)
      await loadArticles()
    }
  }
  const columns: TableColumn<Article>[] = [
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
        <Button
          size="small"
          onClick={() => {
            if (!dirty || window.confirm(t('app.admin.discard'))) setEditing(item)
          }}
        >
          {t('app.admin.edit')}
        </Button>
      ),
    },
  ]
  if (!session)
    return (
      <section className="admin-login">
        <Card title={t('app.admin.loginTitle')} className="admin-login-card">
          <div className="admin-form">
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
            />
            {message && <p className="admin-message">{message}</p>}
            <Button type="primary" block loading={loading} onClick={() => void login()}>
              {t('app.admin.login')}
            </Button>
          </div>
        </Card>
      </section>
    )
  const editor = (
    <div className="admin-editor-pane">
      <Input
        value={editing?.title ?? ''}
        onChange={(e) => change('title', e.target.value)}
        placeholder={t('app.admin.articleTitle')}
      />
      <Input
        value={editing?.slug ?? ''}
        onChange={(e) => change('slug', e.target.value)}
        placeholder={t('app.admin.slug')}
      />
      <textarea
        className="admin-summary"
        value={editing?.summary ?? ''}
        onChange={(e) => change('summary', e.target.value)}
        placeholder={t('app.admin.summary')}
      />
      <textarea
        className="admin-markdown"
        value={editing?.markdown ?? ''}
        onChange={(e) => change('markdown', e.target.value)}
        placeholder={t('app.admin.markdown')}
      />
    </div>
  )
  const rendered = (
    <article
      className="admin-preview docs-markdown"
      dangerouslySetInnerHTML={{ __html: preview }}
    />
  )
  return (
    <section className="admin-app">
      <header className="admin-toolbar">
        <div>
          <strong>{t('app.admin.welcome', { name: session.username })}</strong>
          {message && <span className="admin-message">{message}</span>}
        </div>
        <div className="admin-actions">
          <Button
            onClick={() => {
              setTrash((value) => !value)
              setEditing(null)
            }}
          >
            {trash ? t('app.admin.backArticles') : t('app.admin.trash')}
          </Button>
          <Button type="text" onClick={() => void logout()}>
            {t('app.admin.logout')}
          </Button>
        </div>
      </header>
      <div className="admin-workspace">
        <aside className="admin-list">
          <Button
            type="primary"
            block
            onClick={() => {
              setEditing({ ...emptyArticle })
              setDirty(false)
            }}
          >
            {t('app.admin.newArticle')}
          </Button>
          <Table
            columns={columns as TableColumn<Record<string, unknown>>[]}
            dataSource={articles}
            rowKey="id"
            loading={loading}
            emptyText={t('app.admin.empty')}
          />
        </aside>
        <main className="admin-detail">
          {editing ? (
            <>
              <div className="admin-savebar">
                <Button type="primary" onClick={() => void save()}>
                  {t('app.admin.save')}
                </Button>
                {editing.id > 0 && !editing.deletedAt && (
                  <Button
                    onClick={() =>
                      void action(editing.status === 'published' ? 'unpublish' : 'publish')
                    }
                  >
                    {t(
                      editing.status === 'published' ? 'app.admin.unpublish' : 'app.admin.publish',
                    )}
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
                  editing.id > 0 && (
                    <Button danger onClick={() => void remove()}>
                      {t('app.admin.delete')}
                    </Button>
                  )
                )}
              </div>
              <div className="admin-editor-desktop">
                {editor}
                {rendered}
              </div>
              <div className="admin-editor-mobile">
                <Tabs
                  items={[
                    { key: 'edit', label: t('app.admin.edit'), children: editor },
                    { key: 'preview', label: t('app.admin.preview'), children: rendered },
                  ]}
                />
              </div>
            </>
          ) : (
            <Card className="island-state island-state-large">
              <span className="island-state-icon">📝</span>
              <h2>{t('app.admin.choose')}</h2>
            </Card>
          )}
        </main>
      </div>
    </section>
  )
}
