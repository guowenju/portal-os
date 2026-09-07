//! 媒体领域仓储：封装媒体资源及引用检查查询。

use super::models::MediaAsset;
use sqlx::SqlitePool;

/// 新媒体记录。
pub struct NewMedia<'a> {
    pub original_name: &'a str,
    pub storage_key: &'a str,
    pub mime_type: &'a str,
    pub byte_size: i64,
    pub created_at: &'a str,
}

/// 媒体资源数据访问入口。
#[derive(Clone)]
pub struct MediaRepository {
    pool: SqlitePool,
}

impl MediaRepository {
    /// 使用共享连接池创建仓储。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// 按主键查询媒体。
    pub async fn by_id(&self, id: i64) -> sqlx::Result<Option<MediaAsset>> {
        sqlx::query_as::<_, MediaAsset>("SELECT * FROM media_assets WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    /// 按存储键查询媒体。
    pub async fn by_storage_key(&self, storage_key: &str) -> sqlx::Result<Option<MediaAsset>> {
        sqlx::query_as::<_, MediaAsset>("SELECT * FROM media_assets WHERE storage_key = ?")
            .bind(storage_key)
            .fetch_optional(&self.pool)
            .await
    }

    /// 按创建时间倒序列出媒体。
    pub async fn all(&self) -> sqlx::Result<Vec<MediaAsset>> {
        sqlx::query_as::<_, MediaAsset>(
            "SELECT * FROM media_assets ORDER BY created_at DESC, id DESC",
        )
        .fetch_all(&self.pool)
        .await
    }

    /// 创建媒体记录。
    pub async fn create(&self, input: NewMedia<'_>) -> sqlx::Result<MediaAsset> {
        sqlx::query_as::<_, MediaAsset>(
            "INSERT INTO media_assets \
             (original_name, storage_key, mime_type, byte_size, created_at) \
             VALUES (?, ?, ?, ?, ?) RETURNING *",
        )
        .bind(input.original_name)
        .bind(input.storage_key)
        .bind(input.mime_type)
        .bind(input.byte_size)
        .bind(input.created_at)
        .fetch_one(&self.pool)
        .await
    }

    /// 返回引用媒体的文章标题与站点默认分享图说明。
    pub async fn references(&self, id: i64) -> sqlx::Result<Vec<String>> {
        let mut references = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT a.title FROM articles a \
             LEFT JOIN article_medias am ON am.article_id = a.id \
             WHERE a.cover_media_id = ? OR am.media_id = ? ORDER BY a.title",
        )
        .bind(id)
        .bind(id)
        .fetch_all(&self.pool)
        .await?;
        let used_by_settings = sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM site_settings WHERE default_share_image_id = ?)",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        if used_by_settings != 0 {
            references.push("站点默认分享图".to_string());
        }
        Ok(references)
    }

    /// 删除媒体记录。
    pub async fn delete(&self, id: i64) -> sqlx::Result<bool> {
        Ok(sqlx::query("DELETE FROM media_assets WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected()
            > 0)
    }
}
