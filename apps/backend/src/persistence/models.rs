//! 博客持久化模型：定义 alpha.2 全新 SQLite 数据结构。

/// 管理员账户。
#[derive(Debug, Clone, toasty::Model)]
pub struct AdminUser {
    #[key]
    #[auto]
    pub id: u64,
    #[unique]
    pub username: String,
    pub password_hash: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_login_at: Option<String>,
}

/// 服务端管理员会话。
#[derive(Debug, Clone, toasty::Model)]
pub struct AdminSession {
    #[key]
    pub token_hash: String,
    #[index]
    pub admin_user_id: u64,
    #[belongs_to(key = admin_user_id, references = id)]
    pub admin_user: toasty::Deferred<AdminUser>,
    pub csrf_hash: String,
    pub created_at: String,
    pub expires_at: String,
    pub last_active_at: String,
}

/// 博客文章。
#[derive(Debug, Clone, toasty::Model)]
pub struct Article {
    #[key]
    #[auto]
    pub id: u64,
    pub title: String,
    #[unique]
    pub slug: String,
    pub summary: String,
    pub markdown: String,
    #[index]
    pub status: String,
    pub published_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub version: u64,
}

/// 文章分类。
#[derive(Debug, Clone, toasty::Model)]
pub struct Category {
    #[key]
    #[auto]
    pub id: u64,
    #[unique]
    pub name: String,
    #[unique]
    pub slug: String,
    pub sort_order: i64,
}

/// 文章标签。
#[derive(Debug, Clone, toasty::Model)]
pub struct Tag {
    #[key]
    #[auto]
    pub id: u64,
    #[unique]
    pub name: String,
    #[unique]
    pub slug: String,
    pub sort_order: i64,
}

/// 文章与分类关联。
#[derive(Debug, Clone, toasty::Model)]
pub struct ArticleCategory {
    #[key]
    pub article_id: u64,
    #[belongs_to(key = article_id, references = id)]
    pub article: toasty::Deferred<Article>,
    #[key]
    pub category_id: u64,
    #[belongs_to(key = category_id, references = id)]
    pub category: toasty::Deferred<Category>,
}

/// 文章与标签关联。
#[derive(Debug, Clone, toasty::Model)]
pub struct ArticleTag {
    #[key]
    pub article_id: u64,
    #[belongs_to(key = article_id, references = id)]
    pub article: toasty::Deferred<Article>,
    #[key]
    pub tag_id: u64,
    #[belongs_to(key = tag_id, references = id)]
    pub tag: toasty::Deferred<Tag>,
}

/// 已发布文章的历史地址。
#[derive(Debug, Clone, toasty::Model)]
pub struct ArticleSlugHistory {
    #[key]
    pub slug: String,
    #[index]
    pub article_id: u64,
    #[belongs_to(key = article_id, references = id)]
    pub article: toasty::Deferred<Article>,
}
