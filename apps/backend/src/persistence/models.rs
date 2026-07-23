//! 博客持久化模型：定义文章、分类、标签、媒体与站点设置。

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
    pub category_id: Option<u64>,
    #[belongs_to(key = category_id, references = id)]
    pub category: toasty::Deferred<Option<Category>>,
    pub cover_media_id: Option<u64>,
    #[belongs_to(key = cover_media_id, references = id)]
    pub cover_media: toasty::Deferred<Option<MediaAsset>>,
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

/// 博客图片资源。
#[derive(Debug, Clone, toasty::Model)]
pub struct MediaAsset {
    #[key]
    #[auto]
    pub id: u64,
    pub original_name: String,
    #[unique]
    pub storage_key: String,
    pub mime_type: String,
    pub byte_size: u64,
    pub created_at: String,
}

/// 文章正文引用的图片。
#[derive(Debug, Clone, toasty::Model)]
pub struct ArticleMedia {
    #[key]
    pub article_id: u64,
    #[belongs_to(key = article_id, references = id)]
    pub article: toasty::Deferred<Article>,
    #[key]
    pub media_id: u64,
    #[belongs_to(key = media_id, references = id)]
    pub media: toasty::Deferred<MediaAsset>,
}

/// 单例站点设置。
#[derive(Debug, Clone, toasty::Model)]
pub struct SiteSettings {
    #[key]
    pub id: u64,
    pub site_name: String,
    pub site_description: String,
    pub author_name: String,
    pub site_url: String,
    pub default_share_image_id: Option<u64>,
    #[belongs_to(key = default_share_image_id, references = id)]
    pub default_share_image: toasty::Deferred<Option<MediaAsset>>,
    pub updated_at: String,
    pub version: u64,
}
