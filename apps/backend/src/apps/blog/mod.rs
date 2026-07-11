//! 博客内容域：公开阅读与后台文章发布闭环。

use crate::{
    api::response::{ApiError, ApiResponse},
    apps::admin::{AdminState, authenticated},
    persistence::models::{
        Article, ArticleCategory, ArticleSlugHistory, ArticleTag, Category, Tag,
    },
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

/// 注册公开博客和受保护后台文章路由。
pub fn router() -> Router<AdminState> {
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaxonomyItem {
    id: u64,
    name: String,
    slug: String,
    sort_order: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArticleData {
    id: u64,
    title: String,
    slug: String,
    summary: String,
    markdown: String,
    status: String,
    published_at: Option<String>,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
    version: u64,
    category_ids: Vec<u64>,
    tag_ids: Vec<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageData<T> {
    items: Vec<T>,
    total: usize,
    page: usize,
    page_size: usize,
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
    category: Option<u64>,
    tag: Option<u64>,
    status: Option<String>,
    trash: Option<bool>,
    page: Option<usize>,
    page_size: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArticleInput {
    title: String,
    slug: Option<String>,
    summary: String,
    markdown: String,
    category_ids: Vec<u64>,
    tag_ids: Vec<u64>,
    version: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaxonomyInput {
    name: String,
    slug: Option<String>,
    sort_order: Option<i64>,
}

async fn public_articles(
    State(state): State<AdminState>,
    Query(query): Query<ArticleQuery>,
) -> Result<Json<ApiResponse<PageData<ArticleData>>>, ApiError> {
    let mut query = query;
    query.status = Some("published".into());
    query.trash = Some(false);
    Ok(Json(ApiResponse::ok(
        "文章列表读取成功",
        list_articles(&state, query).await?,
    )))
}

async fn public_article(
    State(state): State<AdminState>,
    Path(slug): Path<String>,
) -> Result<Response, ApiError> {
    if let Some(article) = Article::filter_by_slug(&slug)
        .first()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
    {
        if article.status != "published" || article.deleted_at.is_some() {
            return Err(ApiError::new(
                StatusCode::NOT_FOUND,
                "文章不存在",
                "ARTICLE_NOT_FOUND",
            ));
        }
        return Ok(Json(ApiResponse::ok(
            "文章读取成功",
            article_data(&state, article).await?,
        ))
        .into_response());
    }
    if let Some(history) = ArticleSlugHistory::filter_by_slug(&slug)
        .first()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
    {
        let article = Article::get_by_id(&mut state.repository.database(), history.article_id)
            .await
            .map_err(ApiError::internal)?;
        if article.status == "published" && article.deleted_at.is_none() {
            let mut response = StatusCode::PERMANENT_REDIRECT.into_response();
            response.headers_mut().insert(
                header::LOCATION,
                format!("/api/v1/blog/articles/{}", article.slug)
                    .parse()
                    .map_err(ApiError::internal)?,
            );
            return Ok(response);
        }
    }
    Err(ApiError::new(
        StatusCode::NOT_FOUND,
        "文章不存在",
        "ARTICLE_NOT_FOUND",
    ))
}

async fn public_taxonomy(
    State(state): State<AdminState>,
) -> Result<Json<ApiResponse<TaxonomyData>>, ApiError> {
    taxonomy(&state)
        .await
        .map(|data| Json(ApiResponse::ok("分类标签读取成功", data)))
}

async fn admin_articles(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Query(query): Query<ArticleQuery>,
) -> Result<Json<ApiResponse<PageData<ArticleData>>>, ApiError> {
    authenticated(&state.repository, &headers, false).await?;
    Ok(Json(ApiResponse::ok(
        "后台文章列表读取成功",
        list_articles(&state, query).await?,
    )))
}

async fn admin_article(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Result<Json<ApiResponse<ArticleData>>, ApiError> {
    authenticated(&state.repository, &headers, false).await?;
    let article = find_article(&state, id).await?;
    Ok(Json(ApiResponse::ok(
        "文章读取成功",
        article_data(&state, article).await?,
    )))
}

async fn create_article(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Json(input): Json<ArticleInput>,
) -> Result<(StatusCode, Json<ApiResponse<ArticleData>>), ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    validate_article(&input)?;
    let slug = available_slug(&state, input.slug.as_deref().unwrap_or(&input.title), None).await?;
    let now = Utc::now().to_rfc3339();
    let article = Article::create()
        .title(input.title.trim())
        .slug(slug)
        .summary(input.summary.trim())
        .markdown(&input.markdown)
        .status("draft")
        .created_at(&now)
        .updated_at(&now)
        .version(1)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    replace_links(&state, article.id, &input.category_ids, &input.tag_ids).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::ok(
            "草稿已创建",
            article_data(&state, article).await?,
        )),
    ))
}

async fn update_article(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
    Json(input): Json<ArticleInput>,
) -> Result<Json<ApiResponse<ArticleData>>, ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    validate_article(&input)?;
    let mut article = find_article(&state, id).await?;
    if input.version != Some(article.version) {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "文章已被其他操作修改",
            "ARTICLE_VERSION_CONFLICT",
        ));
    }
    let slug = available_slug(
        &state,
        input.slug.as_deref().unwrap_or(&input.title),
        Some(id),
    )
    .await?;
    if article.status == "published" && article.slug != slug {
        ArticleSlugHistory::create()
            .slug(&article.slug)
            .article_id(article.id)
            .exec(&mut state.repository.database())
            .await
            .map_err(ApiError::internal)?;
    }
    let next_version = article.version + 1;
    article
        .update()
        .title(input.title.trim())
        .slug(slug)
        .summary(input.summary.trim())
        .markdown(&input.markdown)
        .updated_at(Utc::now().to_rfc3339())
        .version(next_version)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    replace_links(&state, id, &input.category_ids, &input.tag_ids).await?;
    Ok(Json(ApiResponse::ok(
        "文章已保存",
        article_data(&state, article).await?,
    )))
}

async fn publish_article(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Result<Json<ApiResponse<ArticleData>>, ApiError> {
    mutate_status(&state, &headers, id, "published").await
}
async fn unpublish_article(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Result<Json<ApiResponse<ArticleData>>, ApiError> {
    mutate_status(&state, &headers, id, "draft").await
}

async fn mutate_status(
    state: &AdminState,
    headers: &HeaderMap,
    id: u64,
    status: &str,
) -> Result<Json<ApiResponse<ArticleData>>, ApiError> {
    authenticated(&state.repository, headers, true).await?;
    let mut article = find_article(state, id).await?;
    if article.title.trim().is_empty()
        || article.slug.trim().is_empty()
        || article.markdown.trim().is_empty()
    {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "标题、地址和正文不能为空",
            "ARTICLE_NOT_PUBLISHABLE",
        ));
    }
    let now = Utc::now().to_rfc3339();
    let published_at = (status == "published").then_some(now.clone());
    let next_version = article.version + 1;
    article
        .update()
        .status(status)
        .published_at(published_at)
        .updated_at(now)
        .version(next_version)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(ApiResponse::ok(
        if status == "published" {
            "文章已发布"
        } else {
            "文章已撤回"
        },
        article_data(state, article).await?,
    )))
}

async fn trash_article(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    let mut article = find_article(&state, id).await?;
    let next_version = article.version + 1;
    article
        .update()
        .deleted_at(Utc::now().to_rfc3339())
        .updated_at(Utc::now().to_rfc3339())
        .version(next_version)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(ApiResponse::ok("文章已移入回收站", ())))
}

async fn restore_article(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Result<Json<ApiResponse<ArticleData>>, ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    let mut article = find_article(&state, id).await?;
    let next_version = article.version + 1;
    article
        .update()
        .deleted_at(None::<String>)
        .updated_at(Utc::now().to_rfc3339())
        .version(next_version)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(ApiResponse::ok(
        "文章已恢复",
        article_data(&state, article).await?,
    )))
}

async fn permanent_delete_article(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    let article = find_article(&state, id).await?;
    if article.deleted_at.is_none() {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "文章必须先移入回收站",
            "ARTICLE_NOT_TRASHED",
        ));
    }
    clear_links(&state, id).await?;
    for history in ArticleSlugHistory::filter_by_article_id(id)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
    {
        history
            .delete()
            .exec(&mut state.repository.database())
            .await
            .map_err(ApiError::internal)?;
    }
    article
        .delete()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(ApiResponse::ok("文章已永久删除", ())))
}

async fn admin_categories(
    State(state): State<AdminState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<TaxonomyItem>>>, ApiError> {
    authenticated(&state.repository, &headers, false).await?;
    Ok(Json(ApiResponse::ok(
        "分类读取成功",
        taxonomy(&state).await?.categories,
    )))
}
async fn admin_tags(
    State(state): State<AdminState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<TaxonomyItem>>>, ApiError> {
    authenticated(&state.repository, &headers, false).await?;
    Ok(Json(ApiResponse::ok(
        "标签读取成功",
        taxonomy(&state).await?.tags,
    )))
}

async fn create_category(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Json(input): Json<TaxonomyInput>,
) -> Result<(StatusCode, Json<ApiResponse<TaxonomyItem>>), ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    let slug = normalize_slug(input.slug.as_deref().unwrap_or(&input.name))?;
    let item = Category::create()
        .name(input.name.trim())
        .slug(slug)
        .sort_order(input.sort_order.unwrap_or(0))
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::ok("分类已创建", category_item(item))),
    ))
}
async fn create_tag(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Json(input): Json<TaxonomyInput>,
) -> Result<(StatusCode, Json<ApiResponse<TaxonomyItem>>), ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    let slug = normalize_slug(input.slug.as_deref().unwrap_or(&input.name))?;
    let item = Tag::create()
        .name(input.name.trim())
        .slug(slug)
        .sort_order(input.sort_order.unwrap_or(0))
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::ok("标签已创建", tag_item(item))),
    ))
}
async fn update_category(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
    Json(input): Json<TaxonomyInput>,
) -> Result<Json<ApiResponse<TaxonomyItem>>, ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    let mut item = Category::get_by_id(&mut state.repository.database(), id)
        .await
        .map_err(ApiError::internal)?;
    let slug = normalize_slug(input.slug.as_deref().unwrap_or(&input.name))?;
    item.update()
        .name(input.name.trim())
        .slug(slug)
        .sort_order(input.sort_order.unwrap_or(0))
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(ApiResponse::ok("分类已更新", category_item(item))))
}
async fn update_tag(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
    Json(input): Json<TaxonomyInput>,
) -> Result<Json<ApiResponse<TaxonomyItem>>, ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    let mut item = Tag::get_by_id(&mut state.repository.database(), id)
        .await
        .map_err(ApiError::internal)?;
    let slug = normalize_slug(input.slug.as_deref().unwrap_or(&input.name))?;
    item.update()
        .name(input.name.trim())
        .slug(slug)
        .sort_order(input.sort_order.unwrap_or(0))
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(ApiResponse::ok("标签已更新", tag_item(item))))
}
async fn delete_category(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    if ArticleCategory::all()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
        .iter()
        .any(|link| link.category_id == id)
    {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "分类仍被文章使用",
            "CATEGORY_IN_USE",
        ));
    }
    Category::get_by_id(&mut state.repository.database(), id)
        .await
        .map_err(ApiError::internal)?
        .delete()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(ApiResponse::ok("分类已删除", ())))
}
async fn delete_tag(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Path(id): Path<u64>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    authenticated(&state.repository, &headers, true).await?;
    if ArticleTag::all()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
        .iter()
        .any(|link| link.tag_id == id)
    {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "标签仍被文章使用",
            "TAG_IN_USE",
        ));
    }
    Tag::get_by_id(&mut state.repository.database(), id)
        .await
        .map_err(ApiError::internal)?
        .delete()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(ApiResponse::ok("标签已删除", ())))
}

async fn list_articles(
    state: &AdminState,
    query: ArticleQuery,
) -> Result<PageData<ArticleData>, ApiError> {
    let category_links = ArticleCategory::all()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    let tag_links = ArticleTag::all()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    let keyword = query.q.unwrap_or_default().to_lowercase();
    let trash = query.trash.unwrap_or(false);
    let mut articles: Vec<Article> = Article::all()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .filter(|a| {
            a.deleted_at.is_some() == trash
                && query.status.as_ref().is_none_or(|s| &a.status == s)
                && (keyword.is_empty()
                    || a.title.to_lowercase().contains(&keyword)
                    || a.summary.to_lowercase().contains(&keyword))
                && query.category.is_none_or(|id| {
                    category_links
                        .iter()
                        .any(|link| link.article_id == a.id && link.category_id == id)
                })
                && query.tag.is_none_or(|id| {
                    tag_links
                        .iter()
                        .any(|link| link.article_id == a.id && link.tag_id == id)
                })
        })
        .collect();
    articles.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    let total = articles.len();
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let start = (page - 1).saturating_mul(page_size);
    let mut items = Vec::new();
    for article in articles.into_iter().skip(start).take(page_size) {
        items.push(article_data(state, article).await?);
    }
    Ok(PageData {
        items,
        total,
        page,
        page_size,
    })
}

async fn article_data(state: &AdminState, article: Article) -> Result<ArticleData, ApiError> {
    let category_ids = ArticleCategory::filter_by_article_id(article.id)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(|x| x.category_id)
        .collect();
    let tag_ids = ArticleTag::filter_by_article_id(article.id)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(|x| x.tag_id)
        .collect();
    Ok(ArticleData {
        id: article.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        markdown: article.markdown,
        status: article.status,
        published_at: article.published_at,
        created_at: article.created_at,
        updated_at: article.updated_at,
        deleted_at: article.deleted_at,
        version: article.version,
        category_ids,
        tag_ids,
    })
}
async fn find_article(state: &AdminState, id: u64) -> Result<Article, ApiError> {
    Article::get_by_id(&mut state.repository.database(), id)
        .await
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "文章不存在", "ARTICLE_NOT_FOUND"))
}
async fn taxonomy(state: &AdminState) -> Result<TaxonomyData, ApiError> {
    let mut categories: Vec<_> = Category::all()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(category_item)
        .collect();
    let mut tags: Vec<_> = Tag::all()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(tag_item)
        .collect();
    categories.sort_by_key(|x| x.sort_order);
    tags.sort_by_key(|x| x.sort_order);
    Ok(TaxonomyData { categories, tags })
}
fn category_item(x: Category) -> TaxonomyItem {
    TaxonomyItem {
        id: x.id,
        name: x.name,
        slug: x.slug,
        sort_order: x.sort_order,
    }
}
fn tag_item(x: Tag) -> TaxonomyItem {
    TaxonomyItem {
        id: x.id,
        name: x.name,
        slug: x.slug,
        sort_order: x.sort_order,
    }
}
fn validate_article(input: &ArticleInput) -> Result<(), ApiError> {
    if input.title.trim().is_empty() {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "标题不能为空",
            "ARTICLE_TITLE_REQUIRED",
        ));
    }
    Ok(())
}
fn normalize_slug(value: &str) -> Result<String, ApiError> {
    let slug = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "文章地址不能为空",
            "SLUG_REQUIRED",
        ))
    } else {
        Ok(slug)
    }
}
async fn available_slug(
    state: &AdminState,
    value: &str,
    current: Option<u64>,
) -> Result<String, ApiError> {
    let slug = normalize_slug(value)?;
    if let Some(found) = Article::filter_by_slug(&slug)
        .first()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
        && Some(found.id) != current
    {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "文章地址已存在",
            "SLUG_CONFLICT",
        ));
    }
    Ok(slug)
}
async fn clear_links(state: &AdminState, id: u64) -> Result<(), ApiError> {
    for x in ArticleCategory::filter_by_article_id(id)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
    {
        x.delete()
            .exec(&mut state.repository.database())
            .await
            .map_err(ApiError::internal)?;
    }
    for x in ArticleTag::filter_by_article_id(id)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
    {
        x.delete()
            .exec(&mut state.repository.database())
            .await
            .map_err(ApiError::internal)?;
    }
    Ok(())
}
async fn replace_links(
    state: &AdminState,
    id: u64,
    categories: &[u64],
    tags: &[u64],
) -> Result<(), ApiError> {
    clear_links(state, id).await?;
    for &category_id in categories {
        Category::get_by_id(&mut state.repository.database(), category_id)
            .await
            .map_err(|_| {
                ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "分类不存在",
                    "CATEGORY_NOT_FOUND",
                )
            })?;
        ArticleCategory::create()
            .article_id(id)
            .category_id(category_id)
            .exec(&mut state.repository.database())
            .await
            .map_err(ApiError::internal)?;
    }
    for &tag_id in tags {
        Tag::get_by_id(&mut state.repository.database(), tag_id)
            .await
            .map_err(|_| {
                ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "标签不存在",
                    "TAG_NOT_FOUND",
                )
            })?;
        ArticleTag::create()
            .article_id(id)
            .tag_id(tag_id)
            .exec(&mut state.repository.database())
            .await
            .map_err(ApiError::internal)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_slug;

    /// 验证中文标题和连续分隔符可生成稳定地址。
    #[test]
    fn normalizes_article_slug() {
        assert_eq!(
            normalize_slug(" Alpha 2：岛屿 手账 ").unwrap(),
            "alpha-2-岛屿-手账"
        );
        assert!(normalize_slug("---").is_err());
    }
}
