//! 博客领域仓储：封装文章、分类标签、关联与站点设置查询。

use super::models::{
    Article, ArticleSlugHistory, ArticleTag, Category, MediaAsset, SiteSettings, Tag,
};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use std::collections::HashMap;

/// 文章筛选与分页条件。
#[derive(Default)]
pub struct ArticleFilter<'a> {
    pub keyword: &'a str,
    pub category_id: Option<i64>,
    pub tag_id: Option<i64>,
    pub status: Option<&'a str>,
    pub trash: bool,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// 保存文章所需字段。
pub struct SaveArticle<'a> {
    pub id: i64,
    pub expected_version: i64,
    pub title: &'a str,
    pub slug: &'a str,
    pub summary: &'a str,
    pub markdown: &'a str,
    pub category_id: Option<i64>,
    pub cover_media_id: Option<i64>,
    pub updated_at: &'a str,
    pub tag_ids: &'a [i64],
    pub media_ids: &'a [i64],
}

/// 更新站点设置所需字段。
pub struct UpdateSiteSettings<'a> {
    pub expected_version: i64,
    pub site_name: &'a str,
    pub site_description: &'a str,
    pub author_name: &'a str,
    pub site_url: &'a str,
    pub default_share_image_id: Option<i64>,
    pub updated_at: &'a str,
}

/// 乐观锁写入结果。
pub enum MutationResult<T> {
    Updated(T),
    NotFound,
    VersionConflict,
}

/// 一批文章的分类、标签和封面关联。
#[derive(Default)]
pub struct ArticleRelations {
    pub categories: HashMap<i64, Category>,
    pub tags: HashMap<i64, Vec<Tag>>,
    pub media: HashMap<i64, MediaAsset>,
}

/// 博客数据访问入口。
#[derive(Clone)]
pub struct BlogRepository {
    pool: SqlitePool,
}

impl BlogRepository {
    /// 使用共享连接池创建仓储。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// 按主键查询文章。
    pub async fn article_by_id(&self, id: i64) -> sqlx::Result<Option<Article>> {
        sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    /// 按当前地址查询文章。
    pub async fn article_by_slug(&self, slug: &str) -> sqlx::Result<Option<Article>> {
        sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE slug = ?")
            .bind(slug)
            .fetch_optional(&self.pool)
            .await
    }

    /// 按历史地址查询记录。
    pub async fn slug_history(&self, slug: &str) -> sqlx::Result<Option<ArticleSlugHistory>> {
        sqlx::query_as::<_, ArticleSlugHistory>(
            "SELECT * FROM article_slug_histories WHERE slug = ?",
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await
    }

    /// 创建空白草稿。
    pub async fn create_draft(&self, slug: &str, now: &str) -> sqlx::Result<Article> {
        sqlx::query_as::<_, Article>(
            "INSERT INTO articles \
             (title, slug, summary, markdown, status, created_at, updated_at, version) \
             VALUES ('', ?, '', '', 'draft', ?, ?, 1) RETURNING *",
        )
        .bind(slug)
        .bind(now)
        .bind(now)
        .fetch_one(&self.pool)
        .await
    }

    /// 根据筛选条件查询文章。
    pub async fn articles(&self, filter: &ArticleFilter<'_>) -> sqlx::Result<Vec<Article>> {
        let mut query = QueryBuilder::<Sqlite>::new("SELECT a.* FROM articles a WHERE ");
        push_filters(&mut query, filter);
        query.push(" ORDER BY a.published_at DESC, a.created_at DESC, a.id DESC");
        if let Some(limit) = filter.limit {
            query.push(" LIMIT ").push_bind(limit);
        }
        if let Some(offset) = filter.offset {
            query.push(" OFFSET ").push_bind(offset);
        }
        query
            .build_query_as::<Article>()
            .fetch_all(&self.pool)
            .await
    }

    /// 统计筛选后的文章数。
    pub async fn article_count(&self, filter: &ArticleFilter<'_>) -> sqlx::Result<i64> {
        let mut query = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM articles a WHERE ");
        push_filters(&mut query, filter);
        query.build_query_scalar().fetch_one(&self.pool).await
    }

    /// 批量加载文章列表所需关联，避免逐篇查询。
    pub async fn article_relations(&self, articles: &[Article]) -> sqlx::Result<ArticleRelations> {
        let mut relations = ArticleRelations::default();
        let category_ids = articles
            .iter()
            .filter_map(|article| article.category_id)
            .collect::<Vec<_>>();
        if !category_ids.is_empty() {
            let mut query = QueryBuilder::<Sqlite>::new("SELECT * FROM categories WHERE id IN (");
            push_ids(&mut query, &category_ids);
            for category in query
                .build_query_as::<Category>()
                .fetch_all(&self.pool)
                .await?
            {
                relations.categories.insert(category.id, category);
            }
        }
        let article_ids = articles
            .iter()
            .map(|article| article.id)
            .collect::<Vec<_>>();
        if !article_ids.is_empty() {
            let mut query = QueryBuilder::<Sqlite>::new(
                "SELECT at.article_id, t.id, t.name, t.slug, t.sort_order \
                 FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id IN (",
            );
            push_ids(&mut query, &article_ids);
            query.push(" ORDER BY t.sort_order, t.id");
            let rows = query
                .build_query_as::<(i64, i64, String, String, i64)>()
                .fetch_all(&self.pool)
                .await?;
            for (article_id, id, name, slug, sort_order) in rows {
                relations.tags.entry(article_id).or_default().push(Tag {
                    id,
                    name,
                    slug,
                    sort_order,
                });
            }
        }
        let media_ids = articles
            .iter()
            .filter_map(|article| article.cover_media_id)
            .collect::<Vec<_>>();
        if !media_ids.is_empty() {
            let mut query = QueryBuilder::<Sqlite>::new("SELECT * FROM media_assets WHERE id IN (");
            push_ids(&mut query, &media_ids);
            for media in query
                .build_query_as::<MediaAsset>()
                .fetch_all(&self.pool)
                .await?
            {
                relations.media.insert(media.id, media);
            }
        }
        Ok(relations)
    }

    /// 保存文章及其标签、正文媒体和历史地址。
    pub async fn save_article(
        &self,
        input: SaveArticle<'_>,
    ) -> sqlx::Result<MutationResult<Article>> {
        let mut transaction = self.pool.begin().await?;
        let current = sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = ?")
            .bind(input.id)
            .fetch_optional(&mut *transaction)
            .await?;
        let Some(current) = current else {
            return Ok(MutationResult::NotFound);
        };
        if current.version != input.expected_version {
            return Ok(MutationResult::VersionConflict);
        }
        if current.status == "published" && current.slug != input.slug {
            sqlx::query(
                "INSERT INTO article_slug_histories (slug, article_id) VALUES (?, ?) \
                 ON CONFLICT(slug) DO UPDATE SET article_id = excluded.article_id",
            )
            .bind(&current.slug)
            .bind(current.id)
            .execute(&mut *transaction)
            .await?;
        }
        let article = sqlx::query_as::<_, Article>(
            "UPDATE articles SET title = ?, slug = ?, summary = ?, markdown = ?, \
             category_id = ?, cover_media_id = ?, updated_at = ?, version = version + 1 \
             WHERE id = ? AND version = ? RETURNING *",
        )
        .bind(input.title)
        .bind(input.slug)
        .bind(input.summary)
        .bind(input.markdown)
        .bind(input.category_id)
        .bind(input.cover_media_id)
        .bind(input.updated_at)
        .bind(input.id)
        .bind(input.expected_version)
        .fetch_optional(&mut *transaction)
        .await?;
        let Some(article) = article else {
            return Ok(MutationResult::VersionConflict);
        };
        sqlx::query("DELETE FROM article_tags WHERE article_id = ?")
            .bind(input.id)
            .execute(&mut *transaction)
            .await?;
        for tag_id in input.tag_ids {
            sqlx::query("INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)")
                .bind(input.id)
                .bind(tag_id)
                .execute(&mut *transaction)
                .await?;
        }
        sqlx::query("DELETE FROM article_medias WHERE article_id = ?")
            .bind(input.id)
            .execute(&mut *transaction)
            .await?;
        for media_id in input.media_ids {
            sqlx::query("INSERT INTO article_medias (article_id, media_id) VALUES (?, ?)")
                .bind(input.id)
                .bind(media_id)
                .execute(&mut *transaction)
                .await?;
        }
        transaction.commit().await?;
        Ok(MutationResult::Updated(article))
    }

    /// 更新文章发布状态并执行乐观锁校验。
    pub async fn set_status(
        &self,
        id: i64,
        expected_version: i64,
        status: &str,
        published_at: Option<&str>,
        updated_at: &str,
    ) -> sqlx::Result<MutationResult<Article>> {
        let updated = sqlx::query_as::<_, Article>(
            "UPDATE articles SET status = ?, published_at = ?, updated_at = ?, \
             version = version + 1 WHERE id = ? AND version = ? RETURNING *",
        )
        .bind(status)
        .bind(published_at)
        .bind(updated_at)
        .bind(id)
        .bind(expected_version)
        .fetch_optional(&self.pool)
        .await?;
        self.classify_update(id, updated).await
    }

    /// 更新文章回收站状态并执行乐观锁校验。
    pub async fn set_deleted_at(
        &self,
        id: i64,
        expected_version: i64,
        deleted_at: Option<&str>,
        updated_at: &str,
    ) -> sqlx::Result<MutationResult<Article>> {
        let updated = sqlx::query_as::<_, Article>(
            "UPDATE articles SET deleted_at = ?, updated_at = ?, version = version + 1 \
             WHERE id = ? AND version = ? RETURNING *",
        )
        .bind(deleted_at)
        .bind(updated_at)
        .bind(id)
        .bind(expected_version)
        .fetch_optional(&self.pool)
        .await?;
        self.classify_update(id, updated).await
    }

    async fn classify_update(
        &self,
        id: i64,
        updated: Option<Article>,
    ) -> sqlx::Result<MutationResult<Article>> {
        if let Some(article) = updated {
            return Ok(MutationResult::Updated(article));
        }
        if self.article_by_id(id).await?.is_some() {
            Ok(MutationResult::VersionConflict)
        } else {
            Ok(MutationResult::NotFound)
        }
    }

    /// 永久删除回收站文章，关联行由外键级联清理。
    pub async fn permanently_delete_article(
        &self,
        id: i64,
        expected_version: i64,
    ) -> sqlx::Result<MutationResult<()>> {
        let deleted = sqlx::query(
            "DELETE FROM articles WHERE id = ? AND version = ? AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .bind(expected_version)
        .execute(&self.pool)
        .await?;
        if deleted.rows_affected() > 0 {
            return Ok(MutationResult::Updated(()));
        }
        match self.article_by_id(id).await? {
            None => Ok(MutationResult::NotFound),
            Some(article) if article.version != expected_version => {
                Ok(MutationResult::VersionConflict)
            }
            Some(_) => Ok(MutationResult::NotFound),
        }
    }

    /// 查询文章标签关联。
    pub async fn article_tags(&self, article_id: i64) -> sqlx::Result<Vec<ArticleTag>> {
        sqlx::query_as::<_, ArticleTag>(
            "SELECT * FROM article_tags WHERE article_id = ? ORDER BY tag_id",
        )
        .bind(article_id)
        .fetch_all(&self.pool)
        .await
    }

    /// 按主键查询分类。
    pub async fn category_by_id(&self, id: i64) -> sqlx::Result<Option<Category>> {
        sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    /// 按主键查询标签。
    pub async fn tag_by_id(&self, id: i64) -> sqlx::Result<Option<Tag>> {
        sqlx::query_as::<_, Tag>("SELECT * FROM tags WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    /// 列出全部分类。
    pub async fn categories(&self) -> sqlx::Result<Vec<Category>> {
        sqlx::query_as::<_, Category>("SELECT * FROM categories ORDER BY sort_order, id")
            .fetch_all(&self.pool)
            .await
    }

    /// 列出全部标签。
    pub async fn tags(&self) -> sqlx::Result<Vec<Tag>> {
        sqlx::query_as::<_, Tag>("SELECT * FROM tags ORDER BY sort_order, id")
            .fetch_all(&self.pool)
            .await
    }

    /// 创建分类。
    pub async fn create_category(
        &self,
        name: &str,
        slug: &str,
        sort_order: i64,
    ) -> sqlx::Result<Category> {
        sqlx::query_as::<_, Category>(
            "INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?) RETURNING *",
        )
        .bind(name)
        .bind(slug)
        .bind(sort_order)
        .fetch_one(&self.pool)
        .await
    }

    /// 创建标签。
    pub async fn create_tag(&self, name: &str, slug: &str, sort_order: i64) -> sqlx::Result<Tag> {
        sqlx::query_as::<_, Tag>(
            "INSERT INTO tags (name, slug, sort_order) VALUES (?, ?, ?) RETURNING *",
        )
        .bind(name)
        .bind(slug)
        .bind(sort_order)
        .fetch_one(&self.pool)
        .await
    }

    /// 更新分类。
    pub async fn update_category(
        &self,
        id: i64,
        name: &str,
        slug: &str,
        sort_order: i64,
    ) -> sqlx::Result<Option<Category>> {
        sqlx::query_as::<_, Category>(
            "UPDATE categories SET name = ?, slug = ?, sort_order = ? WHERE id = ? RETURNING *",
        )
        .bind(name)
        .bind(slug)
        .bind(sort_order)
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    /// 更新标签。
    pub async fn update_tag(
        &self,
        id: i64,
        name: &str,
        slug: &str,
        sort_order: i64,
    ) -> sqlx::Result<Option<Tag>> {
        sqlx::query_as::<_, Tag>(
            "UPDATE tags SET name = ?, slug = ?, sort_order = ? WHERE id = ? RETURNING *",
        )
        .bind(name)
        .bind(slug)
        .bind(sort_order)
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    /// 判断分类是否被文章使用。
    pub async fn category_in_use(&self, id: i64) -> sqlx::Result<bool> {
        Ok(sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM articles WHERE category_id = ?)",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?
            != 0)
    }

    /// 判断标签是否被文章使用。
    pub async fn tag_in_use(&self, id: i64) -> sqlx::Result<bool> {
        Ok(sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM article_tags WHERE tag_id = ?)",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?
            != 0)
    }

    /// 删除分类。
    pub async fn delete_category(&self, id: i64) -> sqlx::Result<bool> {
        Ok(sqlx::query("DELETE FROM categories WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected()
            > 0)
    }

    /// 删除标签。
    pub async fn delete_tag(&self, id: i64) -> sqlx::Result<bool> {
        Ok(sqlx::query("DELETE FROM tags WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected()
            > 0)
    }

    /// 读取站点设置。
    pub async fn site_settings(&self) -> sqlx::Result<SiteSettings> {
        sqlx::query_as::<_, SiteSettings>("SELECT * FROM site_settings WHERE id = 1")
            .fetch_one(&self.pool)
            .await
    }

    /// 使用乐观锁更新站点设置。
    pub async fn update_site_settings(
        &self,
        input: UpdateSiteSettings<'_>,
    ) -> sqlx::Result<Option<SiteSettings>> {
        sqlx::query_as::<_, SiteSettings>(
            "UPDATE site_settings SET site_name = ?, site_description = ?, author_name = ?, \
             site_url = ?, default_share_image_id = ?, updated_at = ?, version = version + 1 \
             WHERE id = 1 AND version = ? RETURNING *",
        )
        .bind(input.site_name)
        .bind(input.site_description)
        .bind(input.author_name)
        .bind(input.site_url)
        .bind(input.default_share_image_id)
        .bind(input.updated_at)
        .bind(input.expected_version)
        .fetch_optional(&self.pool)
        .await
    }

    /// 查询文章当前地址是否被其他文章占用。
    pub async fn article_slug_conflict(
        &self,
        slug: &str,
        current: Option<i64>,
    ) -> sqlx::Result<bool> {
        Ok(sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM articles WHERE slug = ? AND (? IS NULL OR id != ?))",
        )
        .bind(slug)
        .bind(current)
        .bind(current)
        .fetch_one(&self.pool)
        .await?
            != 0)
    }

    /// 查询历史地址是否被其他文章占用。
    pub async fn history_slug_conflict(
        &self,
        slug: &str,
        current: Option<i64>,
    ) -> sqlx::Result<bool> {
        Ok(sqlx::query_scalar::<_, i64>(
            "SELECT EXISTS(SELECT 1 FROM article_slug_histories \
             WHERE slug = ? AND (? IS NULL OR article_id != ?))",
        )
        .bind(slug)
        .bind(current)
        .bind(current)
        .fetch_one(&self.pool)
        .await?
            != 0)
    }

    /// 根据正文媒体存储键解析全部媒体记录。
    pub async fn media_by_storage_keys(
        &self,
        storage_keys: &[String],
    ) -> sqlx::Result<Vec<MediaAsset>> {
        if storage_keys.is_empty() {
            return Ok(Vec::new());
        }
        let mut query =
            QueryBuilder::<Sqlite>::new("SELECT * FROM media_assets WHERE storage_key IN (");
        let mut separated = query.separated(", ");
        for key in storage_keys {
            separated.push_bind(key);
        }
        separated.push_unseparated(")");
        query.build_query_as().fetch_all(&self.pool).await
    }
}

fn push_filters(query: &mut QueryBuilder<Sqlite>, filter: &ArticleFilter<'_>) {
    query
        .push("(a.deleted_at IS NOT NULL) = ")
        .push_bind(filter.trash);
    if let Some(status) = filter.status {
        query.push(" AND a.status = ").push_bind(status);
    }
    if let Some(category_id) = filter.category_id {
        query.push(" AND a.category_id = ").push_bind(category_id);
    }
    if let Some(tag_id) = filter.tag_id {
        query
            .push(" AND EXISTS (SELECT 1 FROM article_tags at WHERE at.article_id = a.id AND at.tag_id = ")
            .push_bind(tag_id)
            .push(")");
    }
    if !filter.keyword.is_empty() {
        let escaped = filter
            .keyword
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = format!("%{escaped}%");
        query
            .push(" AND (LOWER(a.title) LIKE LOWER(")
            .push_bind(pattern.clone())
            .push(") ESCAPE '\\' OR LOWER(a.summary) LIKE LOWER(")
            .push_bind(pattern.clone())
            .push(") ESCAPE '\\' OR LOWER(a.markdown) LIKE LOWER(")
            .push_bind(pattern)
            .push(") ESCAPE '\\')");
    }
}

fn push_ids(query: &mut QueryBuilder<Sqlite>, ids: &[i64]) {
    let mut separated = query.separated(", ");
    for id in ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");
}

#[cfg(test)]
mod tests {
    use super::{ArticleFilter, BlogRepository, MutationResult, SaveArticle};
    use crate::persistence::{
        media_repository::{MediaRepository, NewMedia},
        test_pool,
    };

    /// 验证文章筛选、关联装配、乐观锁及事务回滚。
    #[tokio::test]
    async fn manages_article_aggregate_transactionally() {
        let pool = test_pool().await;
        let blog = BlogRepository::new(pool.clone());
        let media_repository = MediaRepository::new(pool);
        let category = blog.create_category("日志", "journal", 0).await.unwrap();
        let tag = blog.create_tag("岛屿", "island", 0).await.unwrap();
        let media = media_repository
            .create(NewMedia {
                original_name: "cover.png",
                storage_key: "cover.png",
                mime_type: "image/png",
                byte_size: 8,
                created_at: "2026-09-07T00:00:00Z",
            })
            .await
            .unwrap();
        let draft = blog
            .create_draft("draft-test", "2026-09-07T00:00:00Z")
            .await
            .unwrap();
        let saved = blog
            .save_article(SaveArticle {
                id: draft.id,
                expected_version: draft.version,
                title: "第一篇文章",
                slug: "first-post",
                summary: "摘要",
                markdown: "正文",
                category_id: Some(category.id),
                cover_media_id: Some(media.id),
                updated_at: "2026-09-07T01:00:00Z",
                tag_ids: &[tag.id],
                media_ids: &[media.id],
            })
            .await
            .unwrap();
        let MutationResult::Updated(saved) = saved else {
            panic!("首次保存应成功");
        };
        let articles = blog
            .articles(&ArticleFilter {
                keyword: "第一篇",
                category_id: Some(category.id),
                tag_id: Some(tag.id),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(articles.len(), 1);
        let relations = blog.article_relations(&articles).await.unwrap();
        assert_eq!(relations.tags[&saved.id][0].name, "岛屿");
        assert_eq!(relations.media[&media.id].storage_key, "cover.png");

        let stale = blog
            .set_status(
                saved.id,
                saved.version - 1,
                "published",
                Some("2026-09-07T02:00:00Z"),
                "2026-09-07T02:00:00Z",
            )
            .await
            .unwrap();
        assert!(matches!(stale, MutationResult::VersionConflict));

        let failed = blog
            .save_article(SaveArticle {
                id: saved.id,
                expected_version: saved.version,
                title: "不应提交",
                slug: "first-post",
                summary: "摘要",
                markdown: "正文",
                category_id: Some(category.id),
                cover_media_id: Some(media.id),
                updated_at: "2026-09-07T03:00:00Z",
                tag_ids: &[tag.id],
                media_ids: &[i64::MAX],
            })
            .await;
        assert!(failed.is_err());
        let after_failure = blog.article_by_id(saved.id).await.unwrap().unwrap();
        assert_eq!(after_failure.title, "第一篇文章");
        assert_eq!(after_failure.version, saved.version);

        let published = blog
            .set_status(
                saved.id,
                saved.version,
                "published",
                Some("2026-09-07T04:00:00Z"),
                "2026-09-07T04:00:00Z",
            )
            .await
            .unwrap();
        let MutationResult::Updated(published) = published else {
            panic!("发布应成功");
        };
        let renamed = blog
            .save_article(SaveArticle {
                id: published.id,
                expected_version: published.version,
                title: &published.title,
                slug: "renamed-post",
                summary: &published.summary,
                markdown: &published.markdown,
                category_id: published.category_id,
                cover_media_id: published.cover_media_id,
                updated_at: "2026-09-07T05:00:00Z",
                tag_ids: &[tag.id],
                media_ids: &[media.id],
            })
            .await
            .unwrap();
        let MutationResult::Updated(renamed) = renamed else {
            panic!("重命名应成功");
        };
        assert_eq!(
            blog.slug_history("first-post")
                .await
                .unwrap()
                .unwrap()
                .article_id,
            renamed.id
        );
        assert_eq!(
            media_repository.references(media.id).await.unwrap(),
            vec!["第一篇文章"]
        );

        let trashed = blog
            .set_deleted_at(
                renamed.id,
                renamed.version,
                Some("2026-09-07T06:00:00Z"),
                "2026-09-07T06:00:00Z",
            )
            .await
            .unwrap();
        let MutationResult::Updated(trashed) = trashed else {
            panic!("移入回收站应成功");
        };
        assert!(matches!(
            blog.permanently_delete_article(trashed.id, trashed.version)
                .await
                .unwrap(),
            MutationResult::Updated(())
        ));
        assert!(blog.article_by_id(trashed.id).await.unwrap().is_none());
        assert!(blog.slug_history("first-post").await.unwrap().is_none());
        assert!(
            media_repository
                .references(media.id)
                .await
                .unwrap()
                .is_empty()
        );
    }
}
