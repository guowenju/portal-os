//! 路由注册：公开站点只保留应用 API 与前端静态资源回退。

use crate::apps;
use crate::services::static_handler::fallback_handler;
use anyhow::Result;
use axum::extract::connect_info::ConnectInfo;
use axum::{Router, body::Body, extract::DefaultBodyLimit, http::Request};
use std::net::SocketAddr;
use toasty::Db;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::{DefaultOnRequest, DefaultOnResponse, OnRequest, TraceLayer};
use tracing::{Level, info_span};

/// 创建公开 API 路由。
fn public_api_router() -> Result<Router> {
    Ok(Router::new().merge(apps::weather::router()))
}

fn on_request_log(req: &Request<Body>, span: &tracing::Span) {
    DefaultOnRequest::new()
        .level(Level::INFO)
        .on_request(req, span);
}

/// 创建公开站点主路由。
pub async fn create_router(database: Db) -> Result<Router> {
    let repository = crate::persistence::repository::Repository::new(database);
    apps::admin::ensure_admin(&repository).await?;
    let admin_state = apps::admin::AdminState { repository };

    let router = Router::new()
        .nest("/api/v1", public_api_router()?)
        .nest(
            "/api/v1",
            apps::admin::router()
                .merge(apps::blog::router())
                .with_state(admin_state),
        )
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<_>| {
                    let forwarded_ip = request
                        .headers()
                        .get("x-forwarded-for")
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.split(',').next().unwrap_or("").trim().to_string());
                    let connect_ip = request
                        .extensions()
                        .get::<ConnectInfo<SocketAddr>>()
                        .map(|ConnectInfo(addr)| addr.to_string());
                    let client_ip = forwarded_ip
                        .or(connect_ip)
                        .unwrap_or_else(|| "unknown".to_string());

                    info_span!(
                        env!("CARGO_CRATE_NAME"),
                        client_ip,
                        method = ?request.method(),
                        path = ?request.uri().path(),
                        some_other_field = tracing::field::Empty,
                    )
                })
                .on_request(on_request_log)
                .on_response(DefaultOnResponse::new().level(Level::TRACE)),
        )
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(100 * 1024 * 1024))
        .fallback(fallback_handler);

    Ok(router)
}
