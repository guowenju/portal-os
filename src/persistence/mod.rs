//! 持久化基础设施：负责 SQLite 连接池、迁移和领域仓储出口。

pub mod admin_repository;
pub mod blog_repository;
pub mod media_repository;
pub mod models;

use admin_repository::AdminRepository;
use anyhow::{Context, Result};
use blog_repository::BlogRepository;
use media_repository::MediaRepository;
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use std::{env, path::PathBuf, time::Duration};

/// 应用使用的领域仓储集合。
#[derive(Clone)]
pub struct Repositories {
    pub admin: AdminRepository,
    pub blog: BlogRepository,
    pub media: MediaRepository,
}

impl Repositories {
    /// 使用同一连接池创建所有领域仓储。
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            admin: AdminRepository::new(pool.clone()),
            blog: BlogRepository::new(pool.clone()),
            media: MediaRepository::new(pool),
        }
    }
}

/// 打开 SQLite 连接池并执行嵌入式迁移。
pub async fn open_database() -> Result<SqlitePool> {
    let data_dir = env::var_os("PORTAL_OS_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data"));
    std::fs::create_dir_all(&data_dir).context("创建 PortalOS 数据目录失败")?;
    let options = SqliteConnectOptions::new()
        .filename(data_dir.join("portal-os.sqlite3"))
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5))
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .context("连接 SQLite 数据库失败")?;
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .context("执行数据库迁移失败")?;
    Ok(pool)
}

/// 创建执行真实迁移的单连接内存测试数据库。
#[cfg(test)]
pub(crate) async fn test_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .in_memory(true)
                .foreign_keys(true),
        )
        .await
        .expect("测试数据库应可连接");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("测试数据库迁移应成功");
    pool
}

#[cfg(test)]
mod tests {
    use super::test_pool;

    /// 验证迁移会创建默认设置并启用外键约束。
    #[tokio::test]
    async fn migrates_fresh_database() {
        let pool = test_pool().await;
        let site_name =
            sqlx::query_scalar::<_, String>("SELECT site_name FROM site_settings WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        let foreign_keys = sqlx::query_scalar::<_, i64>("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(site_name, "PortalOS");
        assert_eq!(foreign_keys, 1);
    }
}
