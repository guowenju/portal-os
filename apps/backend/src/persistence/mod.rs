//! 持久化基础设施：负责 SQLite 连接、建库和 Repository 出口。

pub mod models;
pub mod repository;

use anyhow::{Context, Result};
use std::{env, path::PathBuf};
use toasty::Db;

/// 打开 alpha.2 SQLite 数据库并确保模型结构存在。
pub async fn open_database() -> Result<Db> {
    let data_dir = env::var_os("PORTAL_OS_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data"));
    std::fs::create_dir_all(&data_dir).context("创建 PortalOS 数据目录失败")?;
    let database_path = data_dir.join("portal-os.sqlite3");
    let is_new_database = !database_path.exists();
    let mut builder = Db::builder();
    builder.models(toasty::models!(
        models::AdminUser,
        models::AdminSession,
        models::Article,
        models::Category,
        models::Tag,
        models::ArticleCategory,
        models::ArticleTag,
        models::ArticleSlugHistory,
    ));
    let mut db = builder
        .build(toasty_driver_sqlite::Sqlite::open(&database_path))
        .await
        .context("连接 SQLite 数据库失败")?;
    if is_new_database {
        db.push_schema()
            .await
            .context("初始化 alpha.2 数据结构失败")?;
    }

    for statement in [
        "CREATE TABLE IF NOT EXISTS portal_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
        "INSERT OR IGNORE INTO portal_schema_migrations (version, applied_at) VALUES (1, CURRENT_TIMESTAMP)",
    ] {
        toasty::sql::statement(statement)
            .exec(&mut db)
            .await
            .with_context(|| format!("执行 SQLite 初始化语句失败：{statement}"))?;
    }
    for pragma in [
        "PRAGMA foreign_keys = ON",
        "PRAGMA busy_timeout = 5000",
        "PRAGMA journal_mode = WAL",
    ] {
        toasty::sql::query(pragma)
            .exec(&mut db)
            .await
            .with_context(|| format!("执行 SQLite 初始化语句失败：{pragma}"))?;
    }
    Ok(db)
}
