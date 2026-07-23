//! 持久化基础设施：负责 SQLite 连接、建库和 Repository 出口。

pub mod models;
pub mod repository;

use anyhow::{Context, Result};
use std::{env, path::PathBuf};
use toasty::Db;

/// 打开 SQLite 数据库并在首次启动时初始化数据结构。
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
        models::ArticleTag,
        models::ArticleSlugHistory,
        models::MediaAsset,
        models::ArticleMedia,
        models::SiteSettings,
    ));
    let mut db = builder
        .build(toasty_driver_sqlite::Sqlite::open(&database_path))
        .await
        .context("连接 SQLite 数据库失败")?;
    if is_new_database {
        db.push_schema().await.context("初始化数据库结构失败")?;
        let now = chrono::Utc::now().to_rfc3339();
        models::SiteSettings::create()
            .id(1)
            .site_name("PortalOS")
            .site_description("动物森林桌面博客")
            .author_name("")
            .site_url("")
            .updated_at(now)
            .version(1)
            .exec(&mut db)
            .await
            .context("初始化站点设置失败")?;
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
