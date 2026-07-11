//! 统一 API 响应与业务错误。

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

/// PortalOS API 统一响应。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub code: u16,
    pub message: String,
    pub data: Option<T>,
    pub error_code: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    /// 创建成功响应。
    pub fn ok(message: impl Into<String>, data: T) -> Self {
        Self {
            success: true,
            code: 200,
            message: message.into(),
            data: Some(data),
            error_code: None,
        }
    }
}

/// 可直接返回给 Axum 的业务错误。
#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
    pub error_code: String,
}

impl ApiError {
    /// 创建业务错误。
    pub fn new(status: StatusCode, message: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
            error_code: code.into(),
        }
    }

    /// 创建内部错误并记录真实原因。
    pub fn internal(error: impl std::fmt::Display) -> Self {
        tracing::error!(error = %error, "API 内部错误");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "服务器内部错误",
            "INTERNAL_ERROR",
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ApiResponse::<()> {
            success: false,
            code: self.status.as_u16(),
            message: self.message,
            data: None,
            error_code: Some(self.error_code),
        };
        (self.status, Json(body)).into_response()
    }
}
