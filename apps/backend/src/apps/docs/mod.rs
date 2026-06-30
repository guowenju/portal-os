//! 文档应用后端：读取 mdBook 风格目录并提供只读文档 API。

use anyhow::{Context, Result};
use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Component, Path as FsPath, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tracing::warn;

/// 创建文档应用 API 路由。
pub fn router() -> Result<Router> {
    let loaded_articles = load_doc_articles()?;
    let bootstrap = Arc::new(build_bootstrap_data(&loaded_articles));
    let articles = Arc::new(loaded_articles);
    let content_dir = docs_content_dir()?;
    let state = DocsState {
        articles,
        content_dir,
        bootstrap,
    };

    Ok(Router::new()
        .route("/docs/bootstrap", get(get_docs_bootstrap))
        .route("/docs/search", get(search_doc_articles))
        .route("/docs/articles", get(list_doc_articles))
        .route("/docs/articles/{*slug}", get(get_doc_article))
        .route("/docs/assets/{*path}", get(get_doc_asset))
        .with_state(state))
}

/// 文档应用共享状态。
#[derive(Debug, Clone)]
struct DocsState {
    /// 启动时从 SUMMARY.md 读取的文档索引。
    articles: Arc<Vec<DocArticleIndex>>,
    /// 文档内容根目录。
    content_dir: PathBuf,
    /// 启动时预计算的文档应用首屏数据。
    bootstrap: Arc<DocBootstrapData>,
}

/// 文档列表查询参数。
#[derive(Debug, Deserialize)]
struct DocArticleListQuery {
    /// 搜索关键词，会匹配标题和分类。
    q: Option<String>,
    /// 分类筛选条件。
    tag: Option<String>,
    /// 页码，从 1 开始。
    page: Option<usize>,
    /// 每页数量。
    page_size: Option<usize>,
}

/// 文档正文搜索查询参数。
#[derive(Debug, Deserialize)]
struct DocArticleSearchQuery {
    /// 搜索关键词，只匹配 Markdown 正文。
    q: Option<String>,
    /// 页码，从 1 开始。
    page: Option<usize>,
    /// 每页数量。
    page_size: Option<usize>,
}

/// 文档摘要。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocArticleSummary {
    /// 由 Markdown 路径生成的无后缀文档地址，例如 /linux/storage/lvm。
    slug: String,
    /// 文档标题，来自 SUMMARY.md 链接文本。
    title: String,
    /// 文档所属多级分类。
    categories: Vec<String>,
}

/// 文档索引。
#[derive(Debug, Clone)]
struct DocArticleIndex {
    /// 由 Markdown 路径生成的无后缀文档地址，例如 /linux/storage/lvm。
    slug: String,
    /// 文档标题，来自 SUMMARY.md 链接文本。
    title: String,
    /// 文档所属多级分类。
    categories: Vec<String>,
    /// Markdown 文件的本地路径。
    path: PathBuf,
}

/// 文档详情。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocArticleDetail {
    /// 由 Markdown 路径生成的无后缀文档地址，例如 /linux/storage/lvm。
    slug: String,
    /// 文档标题，来自 SUMMARY.md 链接文本。
    title: String,
    /// 文档所属多级分类。
    categories: Vec<String>,
    /// Markdown 正文。
    markdown: String,
}

/// 文档应用首屏预加载数据。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocBootstrapData {
    /// 完整文档摘要列表。
    articles: Vec<DocArticleSummary>,
    /// 首屏默认打开的文档详情。
    initial_article: Option<DocArticleDetail>,
}

/// SUMMARY.md 中解析出的目录项。
#[derive(Debug, Clone)]
struct SummaryEntry {
    /// 列表项缩进宽度。
    indent: usize,
    /// 链接文本。
    title: String,
    /// 链接路径。
    path: PathBuf,
}

/// 文档列表响应数据。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocArticleListData {
    /// 当前页文档摘要。
    items: Vec<DocArticleSummary>,
    /// 符合筛选条件的文档总数。
    total: usize,
    /// 当前页码。
    page: usize,
    /// 每页数量。
    page_size: usize,
}

/// 统一 API 响应载荷。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiResponse<T: Serialize> {
    /// 请求是否成功。
    success: bool,
    /// HTTP 风格状态码。
    code: u16,
    /// 响应消息。
    message: String,
    /// 响应数据。
    data: Option<T>,
    /// 业务错误码。
    error_code: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    /// 构造成功响应。
    fn ok(message: impl Into<String>, data: T) -> Self {
        Self {
            success: true,
            code: 200,
            message: message.into(),
            data: Some(data),
            error_code: None,
        }
    }

    /// 构造失败响应。
    fn error(code: u16, message: impl Into<String>, error_code: impl Into<String>) -> Self {
        Self {
            success: false,
            code,
            message: message.into(),
            data: None,
            error_code: Some(error_code.into()),
        }
    }
}

/// 读取文档应用首屏预加载数据。
async fn get_docs_bootstrap(State(state): State<DocsState>) -> Json<ApiResponse<DocBootstrapData>> {
    Json(ApiResponse::ok(
        "文档首屏数据读取成功",
        (*state.bootstrap).clone(),
    ))
}

/// 搜索文档正文。
async fn search_doc_articles(
    State(state): State<DocsState>,
    Query(query): Query<DocArticleSearchQuery>,
) -> Json<ApiResponse<DocArticleListData>> {
    let keyword = query.q.as_deref().map(normalize_filter_text);
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).clamp(1, 200);
    let Some(keyword) = keyword.filter(|value| !value.is_empty()) else {
        return Json(ApiResponse::ok(
            "文档搜索完成",
            DocArticleListData {
                items: Vec::new(),
                total: 0,
                page,
                page_size,
            },
        ));
    };

    let matched: Vec<&DocArticleIndex> = state
        .articles
        .iter()
        .filter(|article| match fs::read_to_string(&article.path) {
            Ok(markdown) => normalize_filter_text(&markdown).contains(&keyword),
            Err(error) => {
                warn!(path = %article.path.display(), error = %error, "搜索时读取文档文件失败");
                false
            }
        })
        .collect();

    let total = matched.len();
    let start = (page - 1).saturating_mul(page_size);
    let items = matched
        .into_iter()
        .skip(start)
        .take(page_size)
        .map(summarize_doc_article)
        .collect();

    Json(ApiResponse::ok(
        "文档搜索完成",
        DocArticleListData {
            items,
            total,
            page,
            page_size,
        },
    ))
}

/// 读取文档列表。
async fn list_doc_articles(
    State(state): State<DocsState>,
    Query(query): Query<DocArticleListQuery>,
) -> Json<ApiResponse<DocArticleListData>> {
    let keyword = query.q.as_deref().map(normalize_filter_text);
    let tag = query.tag.as_deref().map(normalize_filter_text);
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).clamp(1, 200);

    let filtered: Vec<&DocArticleIndex> = state
        .articles
        .iter()
        .filter(|article| {
            let matches_tag = tag.as_ref().is_none_or(|target| {
                article
                    .categories
                    .iter()
                    .any(|item| normalize_filter_text(item) == *target)
            });
            let matches_keyword = keyword.as_ref().is_none_or(|target| {
                normalize_filter_text(&article.title).contains(target)
                    || article
                        .categories
                        .iter()
                        .any(|item| normalize_filter_text(item).contains(target))
            });
            matches_tag && matches_keyword
        })
        .collect();

    let total = filtered.len();
    let start = (page - 1).saturating_mul(page_size);
    let items = filtered
        .into_iter()
        .skip(start)
        .take(page_size)
        .map(summarize_doc_article)
        .collect();

    Json(ApiResponse::ok(
        "文档列表读取成功",
        DocArticleListData {
            items,
            total,
            page,
            page_size,
        },
    ))
}

/// 根据 slug 读取文档详情。
async fn get_doc_article(
    State(state): State<DocsState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Response {
    let normalized_slug = normalize_request_slug(&slug);
    let Some(article) = state
        .articles
        .iter()
        .find(|article| article.slug == normalized_slug)
    else {
        return Json(ApiResponse::<DocArticleDetail>::error(
            404,
            "文档不存在",
            "DOC_ARTICLE_NOT_FOUND",
        ))
        .into_response();
    };

    let metadata = match fs::metadata(&article.path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Json(ApiResponse::<DocArticleDetail>::error(
                404,
                "文档文件不存在",
                "DOC_ARTICLE_FILE_NOT_FOUND",
            ))
            .into_response();
        }
        Err(error) => {
            warn!(path = %article.path.display(), error = %error, "读取文档文件元数据失败");
            return Json(ApiResponse::<DocArticleDetail>::error(
                500,
                "文档读取失败",
                "DOC_ARTICLE_READ_FAILED",
            ))
            .into_response();
        }
    };
    let etag = article_etag(&metadata);
    let last_modified = article_last_modified(&metadata);

    if is_fresh_request(&headers, &etag, &last_modified) {
        return cache_headers(
            StatusCode::NOT_MODIFIED.into_response(),
            &etag,
            &last_modified,
        );
    }

    let detail = match read_doc_article_detail(article) {
        Ok(detail) => detail,
        Err(error) => {
            warn!(path = %article.path.display(), error = %error, "读取文档文件失败");
            return Json(ApiResponse::<DocArticleDetail>::error(
                500,
                "文档读取失败",
                "DOC_ARTICLE_READ_FAILED",
            ))
            .into_response();
        }
    };

    cache_headers(
        Json(ApiResponse::ok("文档读取成功", detail)).into_response(),
        &etag,
        &last_modified,
    )
}

/// 读取文档内引用的静态资源。
async fn get_doc_asset(
    State(state): State<DocsState>,
    headers: HeaderMap,
    Path(path): Path<String>,
) -> Response {
    let Some(relative_path) = safe_relative_path(&path) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if is_markdown_path(&relative_path) {
        return StatusCode::NOT_FOUND.into_response();
    }

    let asset_path = state.content_dir.join(relative_path);
    let metadata = match fs::metadata(&asset_path) {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return StatusCode::NOT_FOUND.into_response(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return StatusCode::NOT_FOUND.into_response();
        }
        Err(error) => {
            warn!(path = %asset_path.display(), error = %error, "读取文档资源元数据失败");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let etag = article_etag(&metadata);
    let last_modified = article_last_modified(&metadata);

    if is_fresh_request(&headers, &etag, &last_modified) {
        return cache_headers(
            StatusCode::NOT_MODIFIED.into_response(),
            &etag,
            &last_modified,
        );
    }

    let content = match fs::read(&asset_path) {
        Ok(content) => content,
        Err(error) => {
            warn!(path = %asset_path.display(), error = %error, "读取文档资源失败");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let mime_type = mime_guess::from_path(&asset_path).first_or_octet_stream();
    let mut response = Response::new(Body::from(content));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(mime_type.as_ref())
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );

    cache_headers(response, &etag, &last_modified)
}

/// 将文档索引转换为列表摘要。
fn summarize_doc_article(article: &DocArticleIndex) -> DocArticleSummary {
    DocArticleSummary {
        slug: article.slug.clone(),
        title: article.title.clone(),
        categories: article.categories.clone(),
    }
}

/// 构建文档应用首屏预加载数据。
fn build_bootstrap_data(articles: &[DocArticleIndex]) -> DocBootstrapData {
    let summaries = articles.iter().map(summarize_doc_article).collect();
    let initial_article = find_initial_doc_article(articles).and_then(|article| {
        read_doc_article_detail(article)
            .inspect_err(|error| warn!(path = %article.path.display(), error = %error, "读取文档首屏文章失败"))
            .ok()
    });

    DocBootstrapData {
        articles: summaries,
        initial_article,
    }
}

/// 查找文档应用首屏默认打开的文章。
fn find_initial_doc_article(articles: &[DocArticleIndex]) -> Option<&DocArticleIndex> {
    articles
        .iter()
        .find(|article| article.slug == "/index")
        .or_else(|| articles.first())
}

/// 读取文档详情正文。
fn read_doc_article_detail(article: &DocArticleIndex) -> Result<DocArticleDetail, std::io::Error> {
    let markdown = fs::read_to_string(&article.path)?;

    Ok(DocArticleDetail {
        slug: article.slug.clone(),
        title: article.title.clone(),
        categories: article.categories.clone(),
        markdown,
    })
}

/// 规范化筛选文本，便于大小写无关匹配。
fn normalize_filter_text(value: &str) -> String {
    value.trim().to_lowercase()
}

/// 规范化详情接口传入的路径型 slug。
fn normalize_request_slug(value: &str) -> String {
    format!("/{}", value.trim_matches('/'))
}

/// 从 SUMMARY.md 读取 mdBook 风格文档索引。
fn load_doc_articles() -> Result<Vec<DocArticleIndex>> {
    let summary_path = docs_summary_path()?;
    let summary_content = fs::read_to_string(&summary_path)
        .with_context(|| format!("读取文档目录索引失败：{}", summary_path.display()))?;
    let summary_dir = summary_path
        .parent()
        .with_context(|| format!("文档目录索引路径无效：{}", summary_path.display()))?;
    let entries = parse_summary_entries(&summary_content);
    let mut articles = Vec::new();
    let mut stack: Vec<SummaryEntry> = Vec::new();

    for entry in &entries {
        while stack
            .last()
            .is_some_and(|parent| parent.indent >= entry.indent)
        {
            stack.pop();
        }

        if is_markdown_path(&entry.path)
            && let Some(article) = index_summary_article(summary_dir, entry, &stack)?
        {
            articles.push(article);
        }

        stack.push(entry.clone());
    }

    Ok(articles)
}

/// 解析 SUMMARY.md 中的列表链接项。
fn parse_summary_entries(content: &str) -> Vec<SummaryEntry> {
    content.lines().filter_map(parse_summary_entry).collect()
}

/// 解析单行 mdBook 列表链接项。
fn parse_summary_entry(line: &str) -> Option<SummaryEntry> {
    let indent = line.len().saturating_sub(line.trim_start().len());
    let trimmed = line.trim_start();
    let item = trimmed.strip_prefix("- ").unwrap_or(trimmed);
    if !item.starts_with('[') {
        return None;
    }
    let (title, path) = parse_markdown_link(item)?;

    Some(SummaryEntry {
        indent,
        title,
        path: PathBuf::from(path),
    })
}

/// 解析 Markdown 链接文本与路径。
fn parse_markdown_link(value: &str) -> Option<(String, String)> {
    let link_start = value.find('[')?;
    let link_end = value[link_start + 1..].find(']')? + link_start + 1;
    let open_paren = value[link_end + 1..].find('(')? + link_end + 1;
    let close_paren = value[open_paren + 1..].find(')')? + open_paren + 1;
    let title = value[link_start + 1..link_end].trim();
    let path = value[open_paren + 1..close_paren].trim();

    if title.is_empty() {
        return None;
    }

    Some((title.to_string(), path.to_string()))
}

/// 判断路径是否是 Markdown 文件。
fn is_markdown_path(path: &FsPath) -> bool {
    path.extension().is_some_and(|extension| extension == "md")
}

/// 根据 SUMMARY.md 中的叶子目录项建立文档索引。
fn index_summary_article(
    summary_dir: &FsPath,
    entry: &SummaryEntry,
    category_stack: &[SummaryEntry],
) -> Result<Option<DocArticleIndex>> {
    let path = summary_dir.join(&entry.path);
    if !path.exists() {
        warn!(
            path = %path.display(),
            "SUMMARY.md 引用的文档文件不存在，已跳过"
        );
        return Ok(None);
    }

    Ok(Some(DocArticleIndex {
        slug: slug_from_markdown_path(&entry.path),
        title: entry.title.clone(),
        categories: category_stack
            .iter()
            .map(|category| category.title.clone())
            .collect(),
        path,
    }))
}

/// 从 Markdown 路径生成无后缀 slug。
fn slug_from_markdown_path(path: &FsPath) -> String {
    let mut parts = Vec::new();
    for component in path.components() {
        if let Component::Normal(value) = component {
            parts.push(value.to_string_lossy().replace('\\', "/"));
        }
    }

    let mut slug = parts.join("/");
    if let Some(stripped) = slug.strip_suffix(".md") {
        slug = stripped.to_string();
    }

    format!("/{slug}")
}

/// 解析文档 SUMMARY.md 路径。
fn docs_summary_path() -> Result<PathBuf> {
    Ok(docs_content_dir()?.join("SUMMARY.md"))
}

/// 解析文档内容根目录。
fn docs_content_dir() -> Result<PathBuf> {
    let cwd = env::current_dir().context("读取当前工作目录失败")?;
    let candidates = [
        PathBuf::from("/app/content/docs"),
        cwd.join("apps").join("server").join("content").join("docs"),
        cwd.join("content").join("docs"),
    ];

    let Some(path) = candidates.into_iter().find(|path| {
        path.join("SUMMARY.md").exists() || path.parent().is_some_and(|parent| parent.exists())
    }) else {
        return Err(anyhow::anyhow!(
            "文档目录不存在：请确认 /app/content/docs 或 apps/server/content/docs 存在"
        ));
    };

    ensure_docs_placeholder(&path)?;
    Ok(path)
}

/// 确保空文档目录也能启动应用。
fn ensure_docs_placeholder(path: &FsPath) -> Result<()> {
    fs::create_dir_all(path).with_context(|| format!("创建文档目录失败：{}", path.display()))?;

    let summary_path = path.join("SUMMARY.md");
    if !summary_path.exists() {
        fs::write(&summary_path, "# Summary\n\n[欢迎](./index.md)\n")
            .with_context(|| format!("创建默认文档目录索引失败：{}", summary_path.display()))?;
    }

    let index_path = path.join("index.md");
    if !index_path.exists() {
        fs::write(
            &index_path,
            "# 欢迎\n\n文档目录当前为空。请将 Markdown 内容放入挂载的 `content/docs` 目录，并在 `SUMMARY.md` 中维护章节结构。\n",
        )
        .with_context(|| format!("创建默认文档首页失败：{}", index_path.display()))?;
    }

    Ok(())
}

/// 将请求路径转换为安全的内容目录相对路径。
fn safe_relative_path(value: &str) -> Option<PathBuf> {
    let mut path = PathBuf::new();
    for component in FsPath::new(value.trim_matches('/')).components() {
        match component {
            Component::Normal(part) => path.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    (!path.as_os_str().is_empty()).then_some(path)
}

/// 根据文件元数据生成弱 ETag。
fn article_etag(metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or_default();

    format!("W/\"{}-{modified}\"", metadata.len())
}

/// 根据文件元数据生成 Last-Modified 字符串。
fn article_last_modified(metadata: &fs::Metadata) -> Option<String> {
    metadata.modified().ok().map(http_date)
}

/// 将系统时间格式化为 HTTP 日期。
fn http_date(time: SystemTime) -> String {
    let date_time: DateTime<Utc> = time.into();
    date_time.format("%a, %d %b %Y %H:%M:%S GMT").to_string()
}

/// 判断客户端缓存是否仍然可用。
fn is_fresh_request(headers: &HeaderMap, etag: &str, last_modified: &Option<String>) -> bool {
    let etag_matched = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(',').any(|item| item.trim() == etag));
    let modified_matched = last_modified.as_ref().is_some_and(|modified| {
        headers
            .get(header::IF_MODIFIED_SINCE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value == modified)
    });

    etag_matched || modified_matched
}

/// 为文档详情响应附加缓存头。
fn cache_headers(mut response: Response, etag: &str, last_modified: &Option<String>) -> Response {
    let headers = response.headers_mut();
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=60"),
    );
    if let Ok(value) = HeaderValue::from_str(etag) {
        headers.insert(header::ETAG, value);
    }
    if let Some(last_modified) = last_modified
        && let Ok(value) = HeaderValue::from_str(last_modified)
    {
        headers.insert(header::LAST_MODIFIED, value);
    }
    response
}
