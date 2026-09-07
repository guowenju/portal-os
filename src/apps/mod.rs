//! 应用后端模块入口。

use crate::persistence::Repositories;

pub mod admin;
pub mod blog;
pub mod weather;

/// HTTP 应用共享状态。
#[derive(Clone)]
pub struct AppState {
    pub repositories: Repositories,
}
