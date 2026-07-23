//! 公开内容与静态资源服务：输出可索引文章、订阅源和媒体文件。

use crate::{
    apps::admin::AdminState,
    persistence::models::{Article, ArticleSlugHistory, MediaAsset},
};
use ammonia::Builder as HtmlSanitizer;
use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Redirect, Response},
    routing::get,
};
use pulldown_cmark::{Options, Parser, html};
use rust_embed::RustEmbed;
use serde::Serialize;
use serde_json::json;
use std::{env, path::PathBuf};

/// 使用 rust-embed 宏，在编译时将前端静态资源打包进二进制文件。
#[derive(RustEmbed)]
#[folder = "../frontend/dist"]
struct FrontendAssets;

/// 注册不位于 API 命名空间的公开内容路由。
pub fn public_content_router() -> Router<AdminState> {
    Router::new()
        .route("/blog/{slug}", get(article_page))
        .route("/rss.xml", get(rss))
        .route("/sitemap.xml", get(sitemap))
        .route("/robots.txt", get(robots))
        .route("/media/{storage_key}", get(media))
}

/// API 404 响应的 JSON 载荷。
#[derive(Serialize)]
pub struct NotFound {
    pub code: u16,
    pub message: String,
    pub details: Option<String>,
}

/// 统一的、智能的 Fallback 处理器。
///
/// 这个处理器负责处理所有未被更精确的路由（如 /api/...）匹配的请求。
/// 它会根据请求的路径来判断：
/// - 如果是未匹配到的 API 请求 (路径以 /api/ 开头)，则返回 JSON 格式的 404 错误。
/// - 如果是其他请求，则视为前端页面或静态资源请求，返回对应的文件或 `index.html`。
pub async fn fallback_handler(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');

    // 关键逻辑：判断请求是否是针对 API 的
    if path.starts_with("api/") {
        return Redirect::to("/404").into_response();
    }

    // --- 如果不是 API 请求，则执行服务前端应用的逻辑 ---
    // 将请求路径转换为嵌入资源中的文件路径
    let mut asset_path = path.to_string();
    if asset_path.is_empty() {
        asset_path = "index.html".to_string();
    }

    match FrontendAssets::get(&asset_path) {
        Some(content) => {
            // 找到了对应的静态文件，直接返回
            let body = Body::from(content.data);
            let mime_type = mime_guess::from_path(&asset_path).first_or_octet_stream();
            Response::builder()
                .header(header::CONTENT_TYPE, mime_type.as_ref())
                .body(body)
                .unwrap()
        }
        None => {
            // 如果找不到文件（例如，访问 /dashboard），则返回 index.html
            match FrontendAssets::get("index.html") {
                Some(content) => {
                    let body = Body::from(content.data);
                    let mime_type = mime_guess::from_path("index.html").first_or_octet_stream();
                    Response::builder()
                        .header(header::CONTENT_TYPE, mime_type.as_ref())
                        .body(body)
                        .unwrap()
                }
                None => handler_404().await.into_response(),
            }
        }
    }
}

async fn article_page(
    State(state): State<AdminState>,
    Path(slug): Path<String>,
) -> Result<Response, StatusCode> {
    let article = Article::filter_by_slug(&slug)
        .first()
        .exec(&mut state.repository.database())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let article = match article {
        Some(article) if article.status == "published" && article.deleted_at.is_none() => article,
        _ => {
            let history = ArticleSlugHistory::filter_by_slug(&slug)
                .first()
                .exec(&mut state.repository.database())
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            if let Some(history) = history {
                let current =
                    Article::get_by_id(&mut state.repository.database(), history.article_id)
                        .await
                        .map_err(|_| StatusCode::NOT_FOUND)?;
                if current.status == "published" && current.deleted_at.is_none() {
                    return Ok(
                        Redirect::permanent(&format!("/blog/{}", current.slug)).into_response()
                    );
                }
            }
            return frontend_index_response(StatusCode::NOT_FOUND);
        }
    };
    let settings = state
        .repository
        .site_settings()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let canonical = absolute_url(&settings.site_url, &format!("/blog/{}", article.slug));
    let rendered = render_markdown(&article.markdown);
    let bootstrap = json!({
        "id": article.id,
        "title": article.title,
        "slug": article.slug,
        "summary": article.summary,
        "markdown": article.markdown,
        "publishedAt": article.published_at,
        "updatedAt": article.updated_at,
    });
    let share_image = match article.cover_media_id.or(settings.default_share_image_id) {
        Some(id) => MediaAsset::get_by_id(&mut state.repository.database(), id)
            .await
            .ok()
            .map(|media| {
                absolute_url(&settings.site_url, &format!("/media/{}", media.storage_key))
            }),
        None => None,
    };
    let template = FrontendAssets::get("index.html").ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let template = String::from_utf8_lossy(&template.data);
    let title = format!("{} | {}", article.title, settings.site_name);
    let mut meta = format!(
        "<title>{}</title><meta name=\"description\" content=\"{}\"><link rel=\"canonical\" href=\"{}\"><meta property=\"og:type\" content=\"article\"><meta property=\"og:title\" content=\"{}\"><meta property=\"og:description\" content=\"{}\"><meta property=\"og:url\" content=\"{}\"><meta name=\"twitter:card\" content=\"summary_large_image\"><meta name=\"twitter:title\" content=\"{}\"><meta name=\"twitter:description\" content=\"{}\">",
        escape_html(&title),
        escape_html(&article.summary),
        escape_html(&canonical),
        escape_html(&article.title),
        escape_html(&article.summary),
        escape_html(&canonical),
        escape_html(&article.title),
        escape_html(&article.summary),
    );
    if let Some(image) = share_image {
        meta.push_str(&format!(
            "<meta property=\"og:image\" content=\"{}\"><meta name=\"twitter:image\" content=\"{}\">",
            escape_html(&image),
            escape_html(&image)
        ));
    }
    let bootstrap = serde_json::to_string(&bootstrap)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .replace('<', "\\u003c");
    let root = format!(
        "<div id=\"root\"><main><article><h1>{}</h1><p>{}</p>{}</article></main></div><script id=\"portal-article-data\" type=\"application/json\">{}</script>",
        escape_html(&article.title),
        escape_html(&article.summary),
        rendered,
        bootstrap
    );
    let html = template
        .replace("<title>PortalOS</title>", &meta)
        .replace("<div id=\"root\"></div>", &root);
    Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(html))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn rss(State(state): State<AdminState>) -> Result<Response, StatusCode> {
    let settings = state
        .repository
        .site_settings()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut articles = published_articles(&state).await?;
    articles.truncate(30);
    let mut items = String::new();
    for article in articles {
        let link = absolute_url(&settings.site_url, &format!("/blog/{}", article.slug));
        items.push_str(&format!(
            "<item><title>{}</title><link>{}</link><guid>{}</guid><description>{}</description>{}</item>",
            escape_xml(&article.title),
            escape_xml(&link),
            escape_xml(&link),
            escape_xml(&article.summary),
            article.published_at.as_deref().and_then(rss_date).map(|date| format!("<pubDate>{}</pubDate>", escape_xml(&date))).unwrap_or_default()
        ));
    }
    let body = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>{}</title><link>{}</link><description>{}</description>{}</channel></rss>",
        escape_xml(&settings.site_name),
        escape_xml(&settings.site_url),
        escape_xml(&settings.site_description),
        items
    );
    xml_response(body)
}

async fn sitemap(State(state): State<AdminState>) -> Result<Response, StatusCode> {
    let settings = state
        .repository
        .site_settings()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut urls = vec![
        absolute_url(&settings.site_url, "/"),
        absolute_url(&settings.site_url, "/blog"),
    ];
    urls.extend(
        published_articles(&state)
            .await?
            .into_iter()
            .map(|article| absolute_url(&settings.site_url, &format!("/blog/{}", article.slug))),
    );
    let entries = urls
        .into_iter()
        .map(|url| format!("<url><loc>{}</loc></url>", escape_xml(&url)))
        .collect::<String>();
    xml_response(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">{entries}</urlset>"
    ))
}

async fn robots(State(state): State<AdminState>) -> Result<Response, StatusCode> {
    let settings = state
        .repository
        .site_settings()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let body = format!(
        "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/v1/admin\nSitemap: {}\n",
        absolute_url(&settings.site_url, "/sitemap.xml")
    );
    Response::builder()
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Body::from(body))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn media(
    State(state): State<AdminState>,
    Path(storage_key): Path<String>,
) -> Result<Response, StatusCode> {
    let item = MediaAsset::filter_by_storage_key(&storage_key)
        .first()
        .exec(&mut state.repository.database())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    let path = media_directory().join(&item.storage_key);
    let bytes = tokio::fs::read(path).await.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            StatusCode::NOT_FOUND
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;
    Response::builder()
        .header(header::CONTENT_TYPE, item.mime_type)
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .header(header::ETAG, format!("\"{}\"", item.storage_key))
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn published_articles(state: &AdminState) -> Result<Vec<Article>, StatusCode> {
    let mut articles: Vec<_> = Article::all()
        .exec(&mut state.repository.database())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .into_iter()
        .filter(|article| article.status == "published" && article.deleted_at.is_none())
        .collect();
    articles.sort_by(|a, b| b.published_at.cmp(&a.published_at));
    Ok(articles)
}

fn render_markdown(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(markdown, options);
    let mut rendered = String::new();
    html::push_html(&mut rendered, parser);
    HtmlSanitizer::default().clean(&rendered).to_string()
}

fn absolute_url(site_url: &str, path: &str) -> String {
    format!("{}{}", site_url.trim_end_matches('/'), path)
}

fn xml_response(body: String) -> Result<Response, StatusCode> {
    Response::builder()
        .header(header::CONTENT_TYPE, "application/xml; charset=utf-8")
        .body(Body::from(body))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn frontend_index_response(status: StatusCode) -> Result<Response, StatusCode> {
    let template = FrontendAssets::get("index.html").ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(template.data.into_owned()))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn escape_html(value: &str) -> String {
    ammonia::clean_text(value)
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn media_directory() -> PathBuf {
    env::var_os("PORTAL_OS_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data"))
        .join("media")
}

fn rss_date(value: &str) -> Option<String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.to_rfc2822())
}

async fn handler_404() -> (StatusCode, Json<NotFound>) {
    let message = NotFound {
        code: StatusCode::NOT_FOUND.as_u16(),
        message: "The requested API resource was not found.".to_string(),
        details: Some("Please check the API endpoint URL and try again.".to_string()),
    };
    (StatusCode::NOT_FOUND, Json(message))
}

#[cfg(test)]
mod tests {
    use super::{render_markdown, rss_date};

    /// 服务端 Markdown 必须移除脚本，同时保留普通正文。
    #[test]
    fn sanitizes_server_markdown() {
        let html = render_markdown("# 标题\n\n<script>alert(1)</script>\n\n正文");
        assert!(html.contains("标题"));
        assert!(html.contains("正文"));
        assert!(!html.contains("<script"));
    }

    /// RSS 发布时间使用 RFC 2822 格式。
    #[test]
    fn formats_rss_date() {
        let date = rss_date("2026-07-23T12:00:00+08:00").unwrap();
        assert!(date.contains("23 Jul 2026"));
        assert!(rss_date("invalid").is_none());
    }
}
