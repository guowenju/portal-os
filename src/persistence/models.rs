//! 博客持久化模型：映射管理员、文章、分类、标签、媒体与站点设置表。

use sqlx::FromRow;

/// 管理员账户。
#[derive(Debug, Clone, FromRow)]
pub struct AdminUser {
    pub id: i64,
    pub username: String,
    pub password_hash: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_login_at: Option<String>,
}

/// 服务端管理员会话。
#[derive(Debug, Clone, FromRow)]
pub struct AdminSession {
    pub token_hash: String,
    pub admin_user_id: i64,
    pub csrf_hash: String,
    pub created_at: String,
    pub expires_at: String,
    pub last_active_at: String,
}

/// 博客文章。
#[derive(Debug, Clone, FromRow)]
pub struct Article {
    pub id: i64,
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub markdown: String,
    pub category_id: Option<i64>,
    pub cover_media_id: Option<i64>,
    pub status: String,
    pub published_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub version: i64,
}

/// 文章分类。
#[derive(Debug, Clone, FromRow)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub sort_order: i64,
}

/// 文章标签。
#[derive(Debug, Clone, FromRow)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub sort_order: i64,
}

/// 文章与标签关联。
#[derive(Debug, Clone, FromRow)]
pub struct ArticleTag {
    pub article_id: i64,
    pub tag_id: i64,
}

/// 已发布文章的历史地址。
#[derive(Debug, Clone, FromRow)]
pub struct ArticleSlugHistory {
    pub slug: String,
    pub article_id: i64,
}

/// 博客图片资源。
#[derive(Debug, Clone, FromRow)]
pub struct MediaAsset {
    pub id: i64,
    pub original_name: String,
    pub storage_key: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub created_at: String,
}

/// 文章正文引用的图片。
#[derive(Debug, Clone, FromRow)]
pub struct ArticleMedia {
    pub article_id: i64,
    pub media_id: i64,
}

/// 单例站点设置。
#[derive(Debug, Clone, FromRow)]
pub struct SiteSettings {
    pub id: i64,
    pub site_name: String,
    pub site_description: String,
    pub author_name: String,
    pub site_url: String,
    pub default_share_image_id: Option<i64>,
    pub updated_at: String,
    pub version: i64,
}
