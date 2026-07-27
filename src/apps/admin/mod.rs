//! 后台管理认证：单管理员初始化、Cookie 会话与 CSRF 校验。

use crate::{
    api::response::{ApiError, ApiResponse},
    persistence::{
        models::{AdminSession, AdminUser},
        repository::Repository,
    },
};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    env,
    sync::{Mutex, OnceLock},
    time::{Duration as StdDuration, Instant},
};

const SESSION_COOKIE: &str = "portal_admin_session";
const DEFAULT_ADMIN_PATH: &str = "admin";
const RESERVED_ADMIN_PATH_PREFIXES: &[&str] = &["api", "assets", "blog", "media"];
static LOGIN_FAILURES: OnceLock<Mutex<HashMap<String, (u8, Instant)>>> = OnceLock::new();

/// 后台共享状态。
#[derive(Clone)]
pub struct AdminState {
    pub repository: Repository,
}

/// 创建后台认证路由。
pub fn router() -> Router<AdminState> {
    Router::new()
        .route("/admin/auth/login", post(login))
        .route("/admin/auth/logout", post(logout))
        .route("/admin/auth/session", get(session))
        .route("/admin/auth/change-password", post(change_password))
}

/// 读取并校验管理员页面入口路径。
pub fn configured_admin_path() -> anyhow::Result<String> {
    match env::var("PORTAL_OS_ADMIN_PATH") {
        Ok(value) => normalize_admin_path(Some(&value)),
        Err(env::VarError::NotPresent) => normalize_admin_path(None),
        Err(env::VarError::NotUnicode(_)) => {
            anyhow::bail!("PORTAL_OS_ADMIN_PATH 必须是有效的 UTF-8 字符串")
        }
    }
}

/// 将管理员入口规范化为无首尾斜杠的安全相对路径。
fn normalize_admin_path(value: Option<&str>) -> anyhow::Result<String> {
    let Some(value) = value else {
        return Ok(DEFAULT_ADMIN_PATH.to_string());
    };
    let path = value.trim().trim_matches('/');
    if path.is_empty() {
        anyhow::bail!("PORTAL_OS_ADMIN_PATH 不能为空");
    }
    let segments = path.split('/').collect::<Vec<_>>();
    if segments.iter().any(|segment| {
        segment.is_empty()
            || !segment
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    }) {
        anyhow::bail!("PORTAL_OS_ADMIN_PATH 每一段仅允许 ASCII 字母、数字、- 和 _");
    }
    if RESERVED_ADMIN_PATH_PREFIXES.contains(&segments[0]) {
        anyhow::bail!(
            "PORTAL_OS_ADMIN_PATH 不能与公开路由前缀 {} 冲突",
            segments[0]
        );
    }
    Ok(segments.join("/"))
}

/// 校验首次初始化使用的管理员账号与密码。
fn validate_admin_credentials(username: &str, password: &str) -> anyhow::Result<()> {
    if username.trim().is_empty() {
        anyhow::bail!("管理员用户名不能为空");
    }
    if password.trim().is_empty() {
        anyhow::bail!("管理员初始密码不能为空");
    }
    Ok(())
}

/// 在空库中创建唯一管理员。
pub async fn ensure_admin(repository: &Repository) -> anyhow::Result<()> {
    if repository.admin().await?.is_some() {
        return Ok(());
    }
    let username = env::var("PORTAL_OS_ADMIN_USERNAME")
        .map_err(|_| anyhow::anyhow!("首次启动必须设置 PORTAL_OS_ADMIN_USERNAME"))?;
    let password = env::var("PORTAL_OS_ADMIN_PASSWORD")
        .map_err(|_| anyhow::anyhow!("首次启动必须设置 PORTAL_OS_ADMIN_PASSWORD"))?;
    validate_admin_credentials(&username, &password)?;
    let now = Utc::now().to_rfc3339();
    AdminUser::create()
        .username(username.trim())
        .password_hash(hash_password(&password)?)
        .created_at(&now)
        .updated_at(&now)
        .exec(&mut repository.database())
        .await?;
    tracing::info!("已创建 PortalOS 唯一管理员");
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionData {
    username: String,
    csrf_token: String,
}

async fn login(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Json(input): Json<LoginRequest>,
) -> Result<Response, ApiError> {
    let client = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .unwrap_or("direct")
        .trim()
        .to_string();
    enforce_login_limit(&client)?;
    let Some(user) = state.repository.admin().await.map_err(ApiError::internal)? else {
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "管理员尚未初始化",
            "ADMIN_NOT_INITIALIZED",
        ));
    };
    if input.username != user.username || !verify_password(&input.password, &user.password_hash) {
        record_login_failure(&client);
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "用户名或密码错误",
            "INVALID_CREDENTIALS",
        ));
    }
    LOGIN_FAILURES
        .get_or_init(Default::default)
        .lock()
        .expect("登录限速锁不可损坏")
        .remove(&client);
    let token = random_token();
    let csrf = random_token();
    let now = Utc::now();
    AdminSession::create()
        .token_hash(hash_token(&token))
        .admin_user_id(user.id)
        .csrf_hash(hash_token(&csrf))
        .created_at(now.to_rfc3339())
        .expires_at((now + Duration::days(7)).to_rfc3339())
        .last_active_at(now.to_rfc3339())
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    let mut response = Json(ApiResponse::ok(
        "登录成功",
        SessionData {
            username: user.username,
            csrf_token: csrf.clone(),
        },
    ))
    .into_response();
    let secure = request_is_secure(&headers);
    response
        .headers_mut()
        .append(header::SET_COOKIE, session_cookie(&token, secure));
    response
        .headers_mut()
        .append(header::SET_COOKIE, csrf_cookie(&csrf, secure));
    Ok(response)
}

async fn session(
    State(state): State<AdminState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<SessionData>>, ApiError> {
    let (user, record) = authenticated(&state.repository, &headers, false).await?;
    let csrf_token = cookie_value(&headers, "portal_admin_csrf")
        .filter(|token| hash_token(token) == record.csrf_hash)
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::UNAUTHORIZED,
                "会话校验信息缺失",
                "CSRF_COOKIE_MISSING",
            )
        })?;
    Ok(Json(ApiResponse::ok(
        "会话有效",
        SessionData {
            username: user.username,
            csrf_token,
        },
    )))
}

async fn logout(State(state): State<AdminState>, headers: HeaderMap) -> Result<Response, ApiError> {
    let (_, record) = authenticated(&state.repository, &headers, true).await?;
    AdminSession::get_by_token_hash(&mut state.repository.database(), &record.token_hash)
        .await
        .map_err(ApiError::internal)?
        .delete()
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    let mut response = Json(ApiResponse::ok("已退出登录", ())).into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "portal_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        ),
    );
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_static("portal_admin_csrf=; Path=/; SameSite=Lax; Max-Age=0"),
    );
    Ok(response)
}

async fn change_password(
    State(state): State<AdminState>,
    headers: HeaderMap,
    Json(input): Json<ChangePasswordRequest>,
) -> Result<Json<ApiResponse<()>>, ApiError> {
    let (mut user, _) = authenticated(&state.repository, &headers, true).await?;
    if !verify_password(&input.current_password, &user.password_hash) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "当前密码错误",
            "INVALID_CURRENT_PASSWORD",
        ));
    }
    if input.new_password.trim().is_empty() {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "新密码不能为空",
            "INVALID_PASSWORD",
        ));
    }
    user.update()
        .password_hash(hash_password(&input.new_password).map_err(ApiError::internal)?)
        .updated_at(Utc::now().to_rfc3339())
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?;
    for record in AdminSession::filter_by_admin_user_id(user.id)
        .exec(&mut state.repository.database())
        .await
        .map_err(ApiError::internal)?
    {
        record
            .delete()
            .exec(&mut state.repository.database())
            .await
            .map_err(ApiError::internal)?;
    }
    Ok(Json(ApiResponse::ok("密码已修改，请重新登录", ())))
}

/// 校验后台会话，写操作同时校验 CSRF。
pub async fn authenticated(
    repository: &Repository,
    headers: &HeaderMap,
    csrf_required: bool,
) -> Result<(AdminUser, AdminSession), ApiError> {
    let token = cookie_value(headers, SESSION_COOKIE)
        .ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "请先登录", "AUTH_REQUIRED"))?;
    let record = AdminSession::get_by_token_hash(&mut repository.database(), hash_token(&token))
        .await
        .map_err(ApiError::internal)?;
    if chrono::DateTime::parse_from_rfc3339(&record.expires_at)
        .map_err(ApiError::internal)?
        .with_timezone(&Utc)
        <= Utc::now()
    {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "会话已过期",
            "SESSION_EXPIRED",
        ));
    }
    if csrf_required {
        if let (Some(origin), Some(host)) = (
            headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()),
            headers.get(header::HOST).and_then(|v| v.to_str().ok()),
        ) && !trusted_origin(origin, host)
        {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "请求来源不受信任",
                "ORIGIN_INVALID",
            ));
        }
        let csrf = headers
            .get("x-csrf-token")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        if hash_token(csrf) != record.csrf_hash {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "CSRF 校验失败",
                "CSRF_INVALID",
            ));
        }
    }
    let user = AdminUser::get_by_id(&mut repository.database(), record.admin_user_id)
        .await
        .map_err(ApiError::internal)?;
    Ok((user, record))
}

fn hash_password(password: &str) -> anyhow::Result<String> {
    let mut salt_bytes = [0_u8; 16];
    rand::rng().fill_bytes(&mut salt_bytes);
    let salt =
        SaltString::encode_b64(&salt_bytes).map_err(|error| anyhow::anyhow!(error.to_string()))?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| anyhow::anyhow!(error.to_string()))
}
fn verify_password(password: &str, encoded: &str) -> bool {
    PasswordHash::new(encoded).ok().is_some_and(|hash| {
        Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .is_ok()
    })
}
fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
fn random_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}
fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| {
            let (key, value) = part.trim().split_once('=')?;
            (key == name).then(|| value.to_string())
        })
}
fn session_cookie(token: &str, secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly{secure}; SameSite=Lax; Max-Age=604800"
    ))
    .expect("会话 Cookie 内容必须有效")
}
fn csrf_cookie(token: &str, secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "portal_admin_csrf={token}; Path=/{secure}; SameSite=Lax; Max-Age=604800"
    ))
    .expect("CSRF Cookie 内容必须有效")
}

fn request_is_secure(headers: &HeaderMap) -> bool {
    headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.eq_ignore_ascii_case("https"))
        || headers
            .get(header::ORIGIN)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("https://"))
}
fn enforce_login_limit(client: &str) -> Result<(), ApiError> {
    let mut failures = LOGIN_FAILURES
        .get_or_init(Default::default)
        .lock()
        .expect("登录限速锁不可损坏");
    if let Some((count, started)) = failures.get(client) {
        if started.elapsed() < StdDuration::from_secs(900) && *count >= 5 {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "登录尝试过于频繁，请稍后再试",
                "LOGIN_RATE_LIMITED",
            ));
        }
        if started.elapsed() >= StdDuration::from_secs(900) {
            failures.remove(client);
        }
    }
    Ok(())
}
fn record_login_failure(client: &str) {
    let mut failures = LOGIN_FAILURES
        .get_or_init(Default::default)
        .lock()
        .expect("登录限速锁不可损坏");
    let entry = failures
        .entry(client.to_string())
        .or_insert((0, Instant::now()));
    entry.0 = entry.0.saturating_add(1);
}

/// 判断请求来源是否为当前站点、显式允许来源或本机开发服务器。
fn trusted_origin(origin: &str, host: &str) -> bool {
    let same_site = origin == format!("http://{host}") || origin == format!("https://{host}");
    let configured = env::var("PORTAL_OS_ALLOWED_ORIGINS")
        .ok()
        .is_some_and(|origins| {
            origins
                .split(',')
                .any(|allowed| allowed.trim().trim_end_matches('/') == origin.trim_end_matches('/'))
        });
    let local_development = ["http://localhost:", "http://127.0.0.1:", "http://[::1]:"]
        .iter()
        .any(|prefix| origin.starts_with(prefix));
    same_site || configured || local_development
}

#[cfg(test)]
mod tests {
    use super::{
        hash_password, normalize_admin_path, trusted_origin, validate_admin_credentials,
        verify_password,
    };

    /// 验证管理员密码仅能由正确明文通过 Argon2id 校验。
    #[test]
    fn hashes_admin_password() {
        let encoded = hash_password("admin").unwrap();
        assert!(verify_password("admin", &encoded));
        assert!(!verify_password("wrong-password", &encoded));
    }

    /// 管理员入口支持默认值、多级路径与首尾斜杠规范化。
    #[test]
    fn normalizes_admin_paths() {
        assert_eq!(normalize_admin_path(None).unwrap(), "admin");
        assert_eq!(
            normalize_admin_path(Some(" /ops/admin/ ")).unwrap(),
            "ops/admin"
        );
        assert!(normalize_admin_path(Some("")).is_err());
        assert!(normalize_admin_path(Some("ops//admin")).is_err());
        assert!(normalize_admin_path(Some("blog/admin")).is_err());
        assert!(normalize_admin_path(Some("ops/admin.html")).is_err());
    }

    /// 管理员凭据允许短密码，但仍拒绝空账号与空密码。
    #[test]
    fn accepts_user_controlled_admin_passwords() {
        assert!(validate_admin_credentials("admin", "admin").is_ok());
        assert!(validate_admin_credentials("", "admin").is_err());
        assert!(validate_admin_credentials("admin", "   ").is_err());
    }

    /// 验证开发服务器跨端口来源与生产同源均可通过校验。
    #[test]
    fn accepts_trusted_origins() {
        assert!(trusted_origin("http://localhost:5173", "localhost:9090"));
        assert!(trusted_origin(
            "https://blog.example.com",
            "blog.example.com"
        ));
        assert!(!trusted_origin(
            "https://evil.example.com",
            "blog.example.com"
        ));
    }
}
