//! Repository：隔离 Toasty 查询类型与 HTTP 业务层。

use super::models::{AdminUser, Article, Category, Tag};
use toasty::Db;

/// PortalOS 数据访问入口。
#[derive(Clone)]
pub struct Repository {
    db: Db,
}

impl Repository {
    /// 使用已初始化数据库创建 Repository。
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// 克隆底层数据库句柄供事务化服务使用。
    pub fn database(&self) -> Db {
        self.db.clone()
    }

    /// 查询唯一管理员。
    pub async fn admin(&self) -> toasty::Result<Option<AdminUser>> {
        AdminUser::all().first().exec(&mut self.db.clone()).await
    }

    /// 按当前地址查询文章。
    pub async fn article_by_slug(&self, slug: &str) -> toasty::Result<Option<Article>> {
        Article::filter_by_slug(slug)
            .first()
            .exec(&mut self.db.clone())
            .await
    }

    /// 列出全部分类。
    pub async fn categories(&self) -> toasty::Result<Vec<Category>> {
        Category::all().exec(&mut self.db.clone()).await
    }

    /// 列出全部标签。
    pub async fn tags(&self) -> toasty::Result<Vec<Tag>> {
        Tag::all().exec(&mut self.db.clone()).await
    }
}
