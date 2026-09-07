CREATE TABLE admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE admin_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    csrf_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL
);
CREATE INDEX index_admin_sessions_by_admin_user_id ON admin_sessions(admin_user_id);
CREATE INDEX index_admin_sessions_by_expires_at ON admin_sessions(expires_at);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE media_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    created_at TEXT NOT NULL
);

CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    markdown TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    cover_media_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL CHECK (version > 0)
);
CREATE INDEX index_articles_by_status_deleted ON articles(status, deleted_at);
CREATE INDEX index_articles_by_category_id ON articles(category_id);
CREATE INDEX index_articles_by_published_at ON articles(published_at DESC, created_at DESC);

CREATE TABLE article_tags (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
    PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX index_article_tags_by_tag_id ON article_tags(tag_id);

CREATE TABLE article_slug_histories (
    slug TEXT PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE
);
CREATE INDEX index_article_slug_histories_by_article_id ON article_slug_histories(article_id);

CREATE TABLE article_medias (
    article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    media_id INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
    PRIMARY KEY (article_id, media_id)
);
CREATE INDEX index_article_medias_by_media_id ON article_medias(media_id);

CREATE TABLE site_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    site_name TEXT NOT NULL,
    site_description TEXT NOT NULL,
    author_name TEXT NOT NULL,
    site_url TEXT NOT NULL,
    default_share_image_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0)
);

INSERT INTO site_settings (
    id, site_name, site_description, author_name, site_url, updated_at, version
) VALUES (
    1, 'PortalOS', '动物森林桌面博客', '', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1
);
