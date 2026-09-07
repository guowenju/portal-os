//! 管理员领域仓储：封装账户与会话的 SQLx 查询。

use super::models::{AdminSession, AdminUser};
use sqlx::SqlitePool;

/// 管理员账户与会话数据访问入口。
#[derive(Clone)]
pub struct AdminRepository {
    pool: SqlitePool,
}

impl AdminRepository {
    /// 使用共享连接池创建仓储。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// 查询唯一管理员。
    pub async fn admin(&self) -> sqlx::Result<Option<AdminUser>> {
        sqlx::query_as::<_, AdminUser>("SELECT * FROM admin_users ORDER BY id LIMIT 1")
            .fetch_optional(&self.pool)
            .await
    }

    /// 创建管理员账户。
    pub async fn create_admin(
        &self,
        username: &str,
        password_hash: &str,
        now: &str,
    ) -> sqlx::Result<AdminUser> {
        sqlx::query_as::<_, AdminUser>(
            "INSERT INTO admin_users (username, password_hash, created_at, updated_at) \
             VALUES (?, ?, ?, ?) RETURNING *",
        )
        .bind(username)
        .bind(password_hash)
        .bind(now)
        .bind(now)
        .fetch_one(&self.pool)
        .await
    }

    /// 按主键读取管理员。
    pub async fn user_by_id(&self, id: i64) -> sqlx::Result<Option<AdminUser>> {
        sqlx::query_as::<_, AdminUser>("SELECT * FROM admin_users WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    /// 创建管理员会话。
    pub async fn create_session(&self, session: &AdminSession) -> sqlx::Result<()> {
        sqlx::query(
            "INSERT INTO admin_sessions \
             (token_hash, admin_user_id, csrf_hash, created_at, expires_at, last_active_at) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&session.token_hash)
        .bind(session.admin_user_id)
        .bind(&session.csrf_hash)
        .bind(&session.created_at)
        .bind(&session.expires_at)
        .bind(&session.last_active_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// 按令牌摘要读取会话。
    pub async fn session_by_token_hash(
        &self,
        token_hash: &str,
    ) -> sqlx::Result<Option<AdminSession>> {
        sqlx::query_as::<_, AdminSession>("SELECT * FROM admin_sessions WHERE token_hash = ?")
            .bind(token_hash)
            .fetch_optional(&self.pool)
            .await
    }

    /// 删除指定会话。
    pub async fn delete_session(&self, token_hash: &str) -> sqlx::Result<()> {
        sqlx::query("DELETE FROM admin_sessions WHERE token_hash = ?")
            .bind(token_hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// 修改密码并在同一事务内删除该管理员的全部会话。
    pub async fn change_password_and_clear_sessions(
        &self,
        admin_user_id: i64,
        password_hash: &str,
        updated_at: &str,
    ) -> sqlx::Result<()> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?")
            .bind(password_hash)
            .bind(updated_at)
            .bind(admin_user_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM admin_sessions WHERE admin_user_id = ?")
            .bind(admin_user_id)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await
    }
}

#[cfg(test)]
mod tests {
    use super::AdminRepository;
    use crate::persistence::{models::AdminSession, test_pool};

    /// 验证管理员、会话以及改密清理会话的完整生命周期。
    #[tokio::test]
    async fn manages_admin_sessions_transactionally() {
        let repository = AdminRepository::new(test_pool().await);
        let user = repository
            .create_admin("islander", "old-hash", "2026-09-07T00:00:00Z")
            .await
            .unwrap();
        repository
            .create_session(&AdminSession {
                token_hash: "token".into(),
                admin_user_id: user.id,
                csrf_hash: "csrf".into(),
                created_at: "2026-09-07T00:00:00Z".into(),
                expires_at: "2026-09-08T00:00:00Z".into(),
                last_active_at: "2026-09-07T00:00:00Z".into(),
            })
            .await
            .unwrap();
        assert!(
            repository
                .session_by_token_hash("token")
                .await
                .unwrap()
                .is_some()
        );

        repository
            .change_password_and_clear_sessions(user.id, "new-hash", "2026-09-07T01:00:00Z")
            .await
            .unwrap();

        assert_eq!(
            repository.admin().await.unwrap().unwrap().password_hash,
            "new-hash"
        );
        assert!(
            repository
                .session_by_token_hash("token")
                .await
                .unwrap()
                .is_none()
        );
    }
}
