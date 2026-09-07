//! 博客内容域：公开阅读、内容分类和后台发布闭环。

use crate::{
    api::response::{ApiError, ApiResponse},
    apps::{AppState, admin::authenticated},
    persistence::models::{Article, Category, MediaAsset, Tag},
    persistence::{
        blog_repository::{
            ArticleFilter, ArticleRelations, MutationResult, SaveArticle, UpdateSiteSettings,
        },
        media_repository::NewMedia,
    },
};
use axum::{
    Json, Router,
    extract::{Multipart, Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
};
use chrono::Utc;
use pulldown_cmark::{Event, Parser, Tag as MarkdownTag};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, env, path::PathBuf};

/// 注册公开博客和受保护后台内容路由。
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/blog/articles", get(public_articles))
        .route("/blog/articles/{slug}", get(public_article))
        .route("/blog/taxonomy", get(public_taxonomy))
        .route("/admin/articles", get(admin_articles).post(create_article))
        .route(
            "/admin/articles/{id}",
            get(admin_article).put(update_article).delete(trash_article),
        )
        .route("/admin/articles/{id}/publish", post(publish_article))
        .route("/admin/articles/{id}/unpublish", post(unpublish_article))
        .route("/admin/articles/{id}/restore", post(restore_article))
        .route(
            "/admin/articles/{id}/permanent",
            delete(permanent_delete_article),
        )
        .route(
            "/admin/categories",
            get(admin_categories).post(create_category),
        )
        .route(
            "/admin/categories/{id}",
            put(update_category).delete(delete_category),
        )
        .route("/admin/tags", get(admin_tags).post(create_tag))
        .route("/admin/tags/{id}", put(update_tag).delete(delete_tag))
        .route(
            "/admin/site-settings",
            get(admin_site_settings).put(update_site_settings),
        )
        .route("/admin/media", get(admin_media).post(upload_media))
        .route("/admin/media/{id}", delete(delete_media))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxonomyItem {
    pub id: i64,
    pub name: String,
    pub slug: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleLink {
    pub title: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleSummary {
    pub id: i64,
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub cover_image_url: Option<String>,
    pub published_at: Option<String>,
    pub updated_at: String,
    pub reading_minutes: usize,
    pub category: Option<TaxonomyItem>,
    pub tags: Vec<TaxonomyItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleDetail {
    #[serde(flatten)]
    pub summary: ArticleSummary,
    pub markdown: String,
    pub previous: Option<ArticleLink>,
    pub next: Option<ArticleLink>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminArticle {
    #[serde(flatten)]
    summary: ArticleSummary,
    markdown: String,
    status: String,
    created_at: String,
    deleted_at: Option<String>,
    version: i64,
    category_id: Option<i64>,
    cover_media_id: Option<i64>,
    tag_ids: Vec<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageData<T> {
    pub items: Vec<T>,
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaxonomyData {
    categories: Vec<TaxonomyItem>,
    tags: Vec<TaxonomyItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArticleQuery {
    q: Option<String>,
    category: Option<i64>,
    tag: Option<i64>,
    status: Option<String>,
    trash: Option<bool>,
    page: Option<usize>,
    page_size: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArticleInput {
    title: String,
    slug: String,
    summary: String,
    markdown: String,
    category_id: Option<i64>,
    cover_media_id: Option<i64>,
    tag_ids: Vec<i64>,
    version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionInput {
    version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaxonomyInput {
    name: String,
    slug: Option<String>,
    sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteSettingsData {
    pub site_name: String,
    pub site_description: String,
    pub author_name: String,
    pub site_url: String,
    pub default_share_image_id: Option<i64>,
    pub default_share_image_url: Option<String>,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SiteSettingsInput {
    site_name: String,
    site_description: String,
    author_name: String,
    site_url: String,
    default_share_image_id: Option<i64>,
    version: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaData {
    pub id: i64,
    pub original_name: String,
    pub url: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub created_at: String,
}

async fn public_articles(
    State(state): State<AppState>,
    Query(mut query): Query<ArticleQuery>,
) -> Result<Json<ApiResponse<PageData<ArticleSummary>>>, ApiError> {
    query.status = Some("published".into());
    query.trash = Some(false);
    Ok(Json(ApiResponse::ok(
        "文章列表读取成功",
        list_public_articles(&state, query).await?,
    )))
}

async fn public_article(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Response, ApiError> {
    if let Some(article) = state
        .repositories
        .blog
        .article_by_slug(&slug)
        .await
        .map_err(ApiError::internal)?
        && article.status == "published"
        && article.deleted_at.is_none()
    {
        return Ok(Json(ApiResponse::ok(
            "文章读取成功",
            article_detail(&state, article).await?,
        ))
        .into_response());
    }
    if let Some(history) = state
        .repositories
        .blog
        .slug_history(&slug)
        .await
        .map_err(ApiError::internal)?
    {
        let article = find_article(&state, history.article_id).await?;
        if article.status == "published" && article.deleted_at.is_none() {
            let mut response = StatusCode::PERMANENT_REDIRECT.into_response();
            response.headers_mut().insert(
                header::LOCATION,
                format!("/blog/{}", article.slug)
                    .parse()
                    .map_err(ApiError::internal)?,
            );
            return Ok(response);
        }
    }
    Err(not_found())
}

async fn public_taxonomy(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<TaxonomyData>>, ApiError> {
    Ok(Json(ApiResponse::ok(
        "分类标签读取成功",
        taxonomy(&state).await?,
    )))
}

async fn admin_articles(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ArticleQuery>,
) -> Result<Json<ApiResponse<PageData<AdminArticle>>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, false).await?;
    Ok(Json(ApiResponse::ok(
        "后台文章列表读取成功",
        list_admin_articles(&state, query).await?,
    )))
}

async fn admin_article(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<AdminArticle>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, false).await?;
    let article = find_article(&state, id).await?;
    Ok(Json(ApiResponse::ok(
        "文章读取成功",
        admin_article_data(&state, article).await?,
    )))
}

async fn create_article(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<ApiResponse<AdminArticle>>), ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let now = Utc::now().to_rfc3339();
    let article = state
        .repositories
        .blog
        .create_draft(&format!("draft-{}", random_suffix()), &now)
        .await
        .map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::ok(
            "草稿已创建",
            admin_article_data(&state, article).await?,
        )),
    ))
}

async fn update_article(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<ArticleInput>,
) -> Result<Json<ApiResponse<AdminArticle>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let article = find_article(&state, id).await?;
    ensure_version(&article, input.version)?;
    validate_relations(
        &state,
        input.category_id,
        input.cover_media_id,
        &input.tag_ids,
    )
    .await?;
    let slug = if input.slug.trim().is_empty() {
        article.slug.clone()
    } else {
        available_slug(&state, &input.slug, Some(id)).await?
    };
    let media_ids = resolve_media_ids(&state, &input.markdown).await?;
    let updated_at = Utc::now().to_rfc3339();
    let article = mutation_article(
        state
            .repositories
            .blog
            .save_article(SaveArticle {
                id,
                expected_version: input.version,
                title: input.title.trim(),
                slug: &slug,
                summary: input.summary.trim(),
                markdown: &input.markdown,
                category_id: input.category_id,
                cover_media_id: input.cover_media_id,
                updated_at: &updated_at,
                tag_ids: &input.tag_ids,
                media_ids: &media_ids,
            })
            .await
            .map_err(ApiError::internal)?,
    )?;
    Ok(Json(ApiResponse::ok(
        "文章已保存",
        admin_article_data(&state, article).await?,
    )))
}

async fn publish_article(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<VersionInput>,
) -> Result<Json<ApiResponse<AdminArticle>>, ApiError> {
    mutate_status(&state, &headers, id, input.version, "published").await
}

async fn unpublish_article(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<VersionInput>,
) -> Result<Json<ApiResponse<AdminArticle>>, ApiError> {
    mutate_status(&state, &headers, id, input.version, "draft").await
}

async fn mutate_status(
    state: &AppState,
    headers: &HeaderMap,
    id: i64,
    version: i64,
    status: &str,
) -> Result<Json<ApiResponse<AdminArticle>>, ApiError> {
    authenticated(&state.repositories.admin, headers, true).await?;
    let article = find_article(state, id).await?;
    ensure_version(&article, version)?;
    if status == "published"
        && (article.title.trim().is_empty()
            || article.slug.trim().is_empty()
            || article.summary.trim().is_empty()
            || article.markdown.trim().is_empty())
    {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "标题、地址、摘要和正文不能为空",
            "ARTICLE_NOT_PUBLISHABLE",
        ));
    }
    if status == "published" {
        let settings = site_settings(state).await?;
        validate_site_url(&settings.site_url)?;
    }
    let now = Utc::now().to_rfc3339();
    let published_at = if status == "published" {
        article.published_at.clone().or_else(|| Some(now.clone()))
    } else {
        article.published_at.clone()
    };
    let article = mutation_article(
        state
            .repositories
            .blog
            .set_status(id, version, status, published_at.as_deref(), &now)
            .await
            .map_err(ApiError::internal)?,
    )?;
    Ok(Json(ApiResponse::ok(
        if status == "published" {
            "文章已发布"
        } else {
            "文章已撤回"
        },
        admin_article_data(state, article).await?,
    )))
}

async fn trash_article(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Query(input): Query<VersionInput>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let article = find_article(&state, id).await?;
    ensure_version(&article, input.version)?;
    let now = Utc::now().to_rfc3339();
    mutation_article(
        state
            .repositories
            .blog
            .set_deleted_at(id, input.version, Some(&now), &now)
            .await
            .map_err(ApiError::internal)?,
    )?;
    Ok(Json(ApiResponse::ok("文章已移入回收站", ())))
}

async fn restore_article(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<VersionInput>,
) -> Result<Json<ApiResponse<AdminArticle>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let article = find_article(&state, id).await?;
    ensure_version(&article, input.version)?;
    let now = Utc::now().to_rfc3339();
    let article = mutation_article(
        state
            .repositories
            .blog
            .set_deleted_at(id, input.version, None, &now)
            .await
            .map_err(ApiError::internal)?,
    )?;
    Ok(Json(ApiResponse::ok(
        "文章已恢复",
        admin_article_data(&state, article).await?,
    )))
}

async fn permanent_delete_article(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Query(input): Query<VersionInput>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let article = find_article(&state, id).await?;
    ensure_version(&article, input.version)?;
    if article.deleted_at.is_none() {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "文章必须先移入回收站",
            "ARTICLE_NOT_TRASHED",
        ));
    }
    match state
        .repositories
        .blog
        .permanently_delete_article(id, input.version)
        .await
        .map_err(ApiError::internal)?
    {
        MutationResult::Updated(()) => {}
        MutationResult::VersionConflict => return Err(version_conflict()),
        MutationResult::NotFound => return Err(not_found()),
    }
    Ok(Json(ApiResponse::ok("文章已永久删除", ())))
}

async fn admin_categories(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<TaxonomyItem>>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, false).await?;
    Ok(Json(ApiResponse::ok(
        "分类读取成功",
        taxonomy(&state).await?.categories,
    )))
}

async fn admin_tags(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<TaxonomyItem>>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, false).await?;
    Ok(Json(ApiResponse::ok(
        "标签读取成功",
        taxonomy(&state).await?.tags,
    )))
}

async fn create_category(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<TaxonomyInput>,
) -> Result<(StatusCode, Json<ApiResponse<TaxonomyItem>>), ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let slug = normalize_slug(input.slug.as_deref().unwrap_or(&input.name))?;
    let item = state
        .repositories
        .blog
        .create_category(
            required_name(&input.name)?,
            &slug,
            input.sort_order.unwrap_or(0),
        )
        .await
        .map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::ok("分类已创建", category_item(item))),
    ))
}

async fn create_tag(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<TaxonomyInput>,
) -> Result<(StatusCode, Json<ApiResponse<TaxonomyItem>>), ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let slug = normalize_slug(input.slug.as_deref().unwrap_or(&input.name))?;
    let item = state
        .repositories
        .blog
        .create_tag(
            required_name(&input.name)?,
            &slug,
            input.sort_order.unwrap_or(0),
        )
        .await
        .map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::ok("标签已创建", tag_item(item))),
    ))
}

async fn update_category(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<TaxonomyInput>,
) -> Result<Json<ApiResponse<TaxonomyItem>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let slug = normalize_slug(input.slug.as_deref().unwrap_or(&input.name))?;
    let item = state
        .repositories
        .blog
        .update_category(
            id,
            required_name(&input.name)?,
            &slug,
            input.sort_order.unwrap_or(0),
        )
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(not_found)?;
    Ok(Json(ApiResponse::ok("分类已更新", category_item(item))))
}

async fn update_tag(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<TaxonomyInput>,
) -> Result<Json<ApiResponse<TaxonomyItem>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let slug = normalize_slug(input.slug.as_deref().unwrap_or(&input.name))?;
    let item = state
        .repositories
        .blog
        .update_tag(
            id,
            required_name(&input.name)?,
            &slug,
            input.sort_order.unwrap_or(0),
        )
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(not_found)?;
    Ok(Json(ApiResponse::ok("标签已更新", tag_item(item))))
}

async fn delete_category(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let in_use = state
        .repositories
        .blog
        .category_in_use(id)
        .await
        .map_err(ApiError::internal)?;
    if in_use {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "分类仍被文章使用",
            "CATEGORY_IN_USE",
        ));
    }
    if !state
        .repositories
        .blog
        .delete_category(id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(not_found());
    }
    Ok(Json(ApiResponse::ok("分类已删除", ())))
}

async fn delete_tag(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let in_use = state
        .repositories
        .blog
        .tag_in_use(id)
        .await
        .map_err(ApiError::internal)?;
    if in_use {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "标签仍被文章使用",
            "TAG_IN_USE",
        ));
    }
    if !state
        .repositories
        .blog
        .delete_tag(id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(not_found());
    }
    Ok(Json(ApiResponse::ok("标签已删除", ())))
}

async fn admin_site_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<SiteSettingsData>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, false).await?;
    Ok(Json(ApiResponse::ok(
        "站点设置读取成功",
        site_settings(&state).await?,
    )))
}

async fn update_site_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SiteSettingsInput>,
) -> Result<Json<ApiResponse<SiteSettingsData>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    validate_site_url(&input.site_url)?;
    if input.site_name.trim().is_empty() {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "站点名称不能为空",
            "SITE_NAME_REQUIRED",
        ));
    }
    if let Some(id) = input.default_share_image_id {
        state
            .repositories
            .media
            .by_id(id)
            .await
            .map_err(ApiError::internal)?
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "默认分享图不存在",
                    "MEDIA_NOT_FOUND",
                )
            })?;
    }
    let settings = state
        .repositories
        .blog
        .site_settings()
        .await
        .map_err(ApiError::internal)?;
    if settings.version != input.version {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "站点设置已被其他操作修改",
            "SITE_SETTINGS_VERSION_CONFLICT",
        ));
    }
    state
        .repositories
        .blog
        .update_site_settings(UpdateSiteSettings {
            expected_version: input.version,
            site_name: input.site_name.trim(),
            site_description: input.site_description.trim(),
            author_name: input.author_name.trim(),
            site_url: input.site_url.trim().trim_end_matches('/'),
            default_share_image_id: input.default_share_image_id,
            updated_at: &Utc::now().to_rfc3339(),
        })
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::CONFLICT,
                "站点设置已被其他操作修改",
                "SITE_SETTINGS_VERSION_CONFLICT",
            )
        })?;
    Ok(Json(ApiResponse::ok(
        "站点设置已保存",
        site_settings(&state).await?,
    )))
}

async fn admin_media(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<MediaData>>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, false).await?;
    let items: Vec<_> = state
        .repositories
        .media
        .all()
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(media_data)
        .collect();
    Ok(Json(ApiResponse::ok("图片列表读取成功", items)))
}

async fn upload_media(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<ApiResponse<MediaData>>), ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let field = multipart
        .next_field()
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                "请选择图片",
                "MEDIA_FILE_REQUIRED",
            )
        })?;
    let original_name = field.file_name().unwrap_or("image").to_string();
    let declared_mime = field.content_type().unwrap_or_default().to_string();
    let bytes = field.bytes().await.map_err(ApiError::internal)?;
    if bytes.len() > 10 * 1024 * 1024 {
        return Err(ApiError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "图片不能超过 10 MiB",
            "MEDIA_TOO_LARGE",
        ));
    }
    let (mime_type, extension) = detect_image(&bytes).ok_or_else(|| {
        ApiError::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "仅支持 JPEG、PNG、WebP 和 GIF 图片",
            "MEDIA_TYPE_UNSUPPORTED",
        )
    })?;
    if !declared_mime.is_empty() && declared_mime != mime_type {
        return Err(ApiError::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "图片内容与声明类型不一致",
            "MEDIA_TYPE_MISMATCH",
        ));
    }
    let storage_key = format!("{}.{}", random_storage_key(), extension);
    let media_dir = media_directory();
    tokio::fs::create_dir_all(&media_dir)
        .await
        .map_err(ApiError::internal)?;
    let temporary_path = media_dir.join(format!(".{storage_key}.upload"));
    let final_path = media_dir.join(&storage_key);
    tokio::fs::write(&temporary_path, &bytes)
        .await
        .map_err(ApiError::internal)?;
    tokio::fs::rename(&temporary_path, &final_path)
        .await
        .map_err(ApiError::internal)?;
    let created_at = Utc::now().to_rfc3339();
    let result = state
        .repositories
        .media
        .create(NewMedia {
            original_name: &original_name,
            storage_key: &storage_key,
            mime_type,
            byte_size: bytes.len() as i64,
            created_at: &created_at,
        })
        .await;
    match result {
        Ok(media) => Ok((
            StatusCode::CREATED,
            Json(ApiResponse::ok("图片上传成功", media_data(media))),
        )),
        Err(error) => {
            let _ = tokio::fs::remove_file(final_path).await;
            Err(ApiError::internal(error))
        }
    }
}

async fn delete_media(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repositories.admin, &headers, true).await?;
    let media = state
        .repositories
        .media
        .by_id(id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "图片不存在", "MEDIA_NOT_FOUND"))?;
    let references = state
        .repositories
        .media
        .references(id)
        .await
        .map_err(ApiError::internal)?;
    if !references.is_empty() {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            format!("图片仍被以下内容使用：{}", references.join("、")),
            "MEDIA_IN_USE",
        ));
    }
    let path = media_directory().join(&media.storage_key);
    state
        .repositories
        .media
        .delete(id)
        .await
        .map_err(ApiError::internal)?;
    match tokio::fs::remove_file(path).await {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(ApiError::internal(error)),
    }
    Ok(Json(ApiResponse::ok("图片已删除", ())))
}

async fn list_public_articles(
    state: &AppState,
    query: ArticleQuery,
) -> Result<PageData<ArticleSummary>, ApiError> {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(12).clamp(1, 50);
    let filter = article_filter(
        &query,
        Some(page_size as i64),
        Some(((page - 1).saturating_mul(page_size)) as i64),
    );
    let articles = state
        .repositories
        .blog
        .articles(&filter)
        .await
        .map_err(ApiError::internal)?;
    let relations = state
        .repositories
        .blog
        .article_relations(&articles)
        .await
        .map_err(ApiError::internal)?;
    let total = state
        .repositories
        .blog
        .article_count(&article_filter(&query, None, None))
        .await
        .map_err(ApiError::internal)? as usize;
    let mut items = Vec::new();
    for article in articles {
        items.push(article_summary(&article, &relations));
    }
    Ok(PageData {
        items,
        total,
        page,
        page_size,
    })
}

async fn list_admin_articles(
    state: &AppState,
    query: ArticleQuery,
) -> Result<PageData<AdminArticle>, ApiError> {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let filter = article_filter(
        &query,
        Some(page_size as i64),
        Some(((page - 1).saturating_mul(page_size)) as i64),
    );
    let articles = state
        .repositories
        .blog
        .articles(&filter)
        .await
        .map_err(ApiError::internal)?;
    let relations = state
        .repositories
        .blog
        .article_relations(&articles)
        .await
        .map_err(ApiError::internal)?;
    let total = state
        .repositories
        .blog
        .article_count(&article_filter(&query, None, None))
        .await
        .map_err(ApiError::internal)? as usize;
    let mut items = Vec::new();
    for article in articles {
        items.push(admin_article_from_relations(article, &relations));
    }
    Ok(PageData {
        items,
        total,
        page,
        page_size,
    })
}

async fn filtered_articles(
    state: &AppState,
    query: &ArticleQuery,
) -> Result<Vec<Article>, ApiError> {
    state
        .repositories
        .blog
        .articles(&article_filter(query, None, None))
        .await
        .map_err(ApiError::internal)
}

fn article_filter<'a>(
    query: &'a ArticleQuery,
    limit: Option<i64>,
    offset: Option<i64>,
) -> ArticleFilter<'a> {
    ArticleFilter {
        keyword: query.q.as_deref().unwrap_or_default().trim(),
        category_id: query.category,
        tag_id: query.tag,
        status: query.status.as_deref(),
        trash: query.trash.unwrap_or(false),
        limit,
        offset,
    }
}

async fn article_detail(state: &AppState, article: Article) -> Result<ArticleDetail, ApiError> {
    let published = filtered_articles(
        state,
        &ArticleQuery {
            q: None,
            category: None,
            tag: None,
            status: Some("published".into()),
            trash: Some(false),
            page: None,
            page_size: None,
        },
    )
    .await?;
    let position = published.iter().position(|item| item.id == article.id);
    let previous = position
        .and_then(|index| published.get(index + 1))
        .map(article_link);
    let next = position
        .and_then(|index| index.checked_sub(1))
        .and_then(|index| published.get(index))
        .map(article_link);
    let relations = state
        .repositories
        .blog
        .article_relations(std::slice::from_ref(&article))
        .await
        .map_err(ApiError::internal)?;
    Ok(ArticleDetail {
        summary: article_summary(&article, &relations),
        markdown: article.markdown,
        previous,
        next,
    })
}

async fn admin_article_data(state: &AppState, article: Article) -> Result<AdminArticle, ApiError> {
    let relations = state
        .repositories
        .blog
        .article_relations(std::slice::from_ref(&article))
        .await
        .map_err(ApiError::internal)?;
    Ok(admin_article_from_relations(article, &relations))
}

fn admin_article_from_relations(article: Article, relations: &ArticleRelations) -> AdminArticle {
    let tag_ids = relations
        .tags
        .get(&article.id)
        .into_iter()
        .flatten()
        .map(|tag| tag.id)
        .collect();
    AdminArticle {
        summary: article_summary(&article, relations),
        markdown: article.markdown,
        status: article.status,
        created_at: article.created_at,
        deleted_at: article.deleted_at,
        version: article.version,
        category_id: article.category_id,
        cover_media_id: article.cover_media_id,
        tag_ids,
    }
}

fn article_summary(article: &Article, relations: &ArticleRelations) -> ArticleSummary {
    let category = article
        .category_id
        .and_then(|id| relations.categories.get(&id).cloned())
        .map(category_item);
    let tags = relations
        .tags
        .get(&article.id)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(tag_item)
        .collect();
    let cover_image_url = article
        .cover_media_id
        .and_then(|id| relations.media.get(&id))
        .map(media_url);
    ArticleSummary {
        id: article.id,
        title: article.title.clone(),
        slug: article.slug.clone(),
        summary: article.summary.clone(),
        cover_image_url,
        published_at: article.published_at.clone(),
        updated_at: article.updated_at.clone(),
        reading_minutes: reading_minutes(&article.markdown),
        category,
        tags,
    }
}

async fn taxonomy(state: &AppState) -> Result<TaxonomyData, ApiError> {
    let categories: Vec<_> = state
        .repositories
        .blog
        .categories()
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(category_item)
        .collect();
    let tags: Vec<_> = state
        .repositories
        .blog
        .tags()
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(tag_item)
        .collect();
    Ok(TaxonomyData { categories, tags })
}

pub async fn site_settings(state: &AppState) -> Result<SiteSettingsData, ApiError> {
    let settings = state
        .repositories
        .blog
        .site_settings()
        .await
        .map_err(ApiError::internal)?;
    let default_share_image_url = match settings.default_share_image_id {
        Some(id) => Some(media_url(
            &state
                .repositories
                .media
                .by_id(id)
                .await
                .map_err(ApiError::internal)?
                .ok_or_else(not_found)?,
        )),
        None => None,
    };
    Ok(SiteSettingsData {
        site_name: settings.site_name,
        site_description: settings.site_description,
        author_name: settings.author_name,
        site_url: settings.site_url,
        default_share_image_id: settings.default_share_image_id,
        default_share_image_url,
        version: settings.version,
    })
}

fn category_item(item: Category) -> TaxonomyItem {
    TaxonomyItem {
        id: item.id,
        name: item.name,
        slug: item.slug,
        sort_order: item.sort_order,
    }
}

fn tag_item(item: Tag) -> TaxonomyItem {
    TaxonomyItem {
        id: item.id,
        name: item.name,
        slug: item.slug,
        sort_order: item.sort_order,
    }
}

fn article_link(article: &Article) -> ArticleLink {
    ArticleLink {
        title: article.title.clone(),
        slug: article.slug.clone(),
    }
}

fn media_url(media: &MediaAsset) -> String {
    format!("/media/{}", media.storage_key)
}

fn media_data(media: MediaAsset) -> MediaData {
    let url = media_url(&media);
    MediaData {
        id: media.id,
        original_name: media.original_name,
        url,
        mime_type: media.mime_type,
        byte_size: media.byte_size,
        created_at: media.created_at,
    }
}

fn ensure_version(article: &Article, version: i64) -> Result<(), ApiError> {
    if article.version != version {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "文章已被其他操作修改",
            "ARTICLE_VERSION_CONFLICT",
        ));
    }
    Ok(())
}

fn required_name(value: &str) -> Result<&str, ApiError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "名称不能为空",
            "TAXONOMY_NAME_REQUIRED",
        ));
    }
    Ok(value)
}

fn validate_site_url(value: &str) -> Result<(), ApiError> {
    let value = value.trim();
    if !(value.starts_with("http://") || value.starts_with("https://"))
        || value.contains(char::is_whitespace)
    {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "站点 URL 必须是完整的 HTTP(S) 地址",
            "SITE_URL_INVALID",
        ));
    }
    Ok(())
}

fn normalize_slug(value: &str) -> Result<String, ApiError> {
    let slug = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "文章地址不能为空",
            "SLUG_REQUIRED",
        ));
    }
    Ok(slug)
}

async fn available_slug(
    state: &AppState,
    value: &str,
    current: Option<i64>,
) -> Result<String, ApiError> {
    let slug = normalize_slug(value)?;
    let article_conflict = state
        .repositories
        .blog
        .article_slug_conflict(&slug, current)
        .await
        .map_err(ApiError::internal)?;
    let history_conflict = state
        .repositories
        .blog
        .history_slug_conflict(&slug, current)
        .await
        .map_err(ApiError::internal)?;
    if article_conflict || history_conflict {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "文章地址已存在",
            "SLUG_CONFLICT",
        ));
    }
    Ok(slug)
}

async fn validate_relations(
    state: &AppState,
    category_id: Option<i64>,
    cover_media_id: Option<i64>,
    tag_ids: &[i64],
) -> Result<(), ApiError> {
    if let Some(id) = category_id {
        state
            .repositories
            .blog
            .category_by_id(id)
            .await
            .map_err(ApiError::internal)?
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "分类不存在",
                    "CATEGORY_NOT_FOUND",
                )
            })?;
    }
    if let Some(id) = cover_media_id {
        state
            .repositories
            .media
            .by_id(id)
            .await
            .map_err(ApiError::internal)?
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "封面图片不存在",
                    "MEDIA_NOT_FOUND",
                )
            })?;
    }
    for &id in tag_ids {
        state
            .repositories
            .blog
            .tag_by_id(id)
            .await
            .map_err(ApiError::internal)?
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "标签不存在",
                    "TAG_NOT_FOUND",
                )
            })?;
    }
    Ok(())
}

async fn resolve_media_ids(state: &AppState, markdown: &str) -> Result<Vec<i64>, ApiError> {
    let mut storage_keys = HashSet::new();
    for event in Parser::new(markdown) {
        if let Event::Start(MarkdownTag::Image { dest_url, .. }) = event
            && let Some(key) = dest_url.strip_prefix("/media/")
        {
            storage_keys.insert(key.to_string());
        }
    }
    let storage_keys = storage_keys.into_iter().collect::<Vec<_>>();
    let media = state
        .repositories
        .blog
        .media_by_storage_keys(&storage_keys)
        .await
        .map_err(ApiError::internal)?;
    if media.len() != storage_keys.len() {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "正文引用了不存在的图片",
            "MEDIA_NOT_FOUND",
        ));
    }
    Ok(media.into_iter().map(|item| item.id).collect())
}

async fn find_article(state: &AppState, id: i64) -> Result<Article, ApiError> {
    state
        .repositories
        .blog
        .article_by_id(id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(not_found)
}

fn mutation_article(result: MutationResult<Article>) -> Result<Article, ApiError> {
    match result {
        MutationResult::Updated(article) => Ok(article),
        MutationResult::NotFound => Err(not_found()),
        MutationResult::VersionConflict => Err(version_conflict()),
    }
}

fn version_conflict() -> ApiError {
    ApiError::new(
        StatusCode::CONFLICT,
        "文章已被其他操作修改",
        "ARTICLE_VERSION_CONFLICT",
    )
}

fn not_found() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "文章不存在", "ARTICLE_NOT_FOUND")
}

fn reading_minutes(markdown: &str) -> usize {
    let latin_words = markdown.split_whitespace().count();
    let wide_characters = markdown
        .chars()
        .filter(|character| !character.is_ascii() && !character.is_whitespace())
        .count();
    ((latin_words + wide_characters / 2).max(1)).div_ceil(220)
}

fn random_suffix() -> String {
    use rand::RngCore;
    let mut bytes = [0_u8; 8];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn random_storage_key() -> String {
    use rand::RngCore;
    let mut bytes = [0_u8; 24];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn media_directory() -> PathBuf {
    env::var_os("PORTAL_OS_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data"))
        .join("media")
}

fn detect_image(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some(("image/jpeg", "jpg"))
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("image/png", "png"))
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some(("image/webp", "webp"))
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(("image/gif", "gif"))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::{detect_image, normalize_slug, reading_minutes, validate_site_url};

    /// 验证中文标题和连续分隔符可生成稳定地址。
    #[test]
    fn normalizes_article_slug() {
        assert_eq!(
            normalize_slug(" Alpha 3：岛屿 手账 ").unwrap(),
            "alpha-3-岛屿-手账"
        );
        assert!(normalize_slug("---").is_err());
    }

    /// 验证阅读时长至少为一分钟并随正文长度增长。
    #[test]
    fn estimates_reading_minutes() {
        assert_eq!(reading_minutes("短文"), 1);
        assert!(reading_minutes(&"word ".repeat(500)) >= 3);
    }

    /// 验证站点地址必须使用完整 HTTP(S) URL。
    #[test]
    fn validates_site_url() {
        assert!(validate_site_url("https://blog.example.com").is_ok());
        assert!(validate_site_url("blog.example.com").is_err());
    }

    /// 验证图片类型由文件签名确定而不是扩展名决定。
    #[test]
    fn detects_supported_images() {
        assert_eq!(
            detect_image(b"\x89PNG\r\n\x1a\nrest"),
            Some(("image/png", "png"))
        );
        assert_eq!(detect_image(b"<svg></svg>"), None);
    }
}
