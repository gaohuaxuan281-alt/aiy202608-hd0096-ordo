"use client";

import { useState } from "react";
import { useAuthUser } from "../../components/AuthSession";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));
}

export function ProfilePage() {
  const user = useAuthUser();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/");
    }
  }

  return (
    <>
      <header className="page-heading profile-heading">
        <div>
          <p className="eyebrow">ACCOUNT & MEMBERSHIP</p>
          <h1>用户中心</h1>
          <p>管理账号信息、登录安全和会员状态。</p>
        </div>
        <span className="account-status"><i />账号状态正常</span>
      </header>

      <section className="profile-grid" aria-label="账号信息">
        <article className="profile-card profile-identity-card">
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">学</span>
            <div>
              <p>学习账号</p>
              <h2>{user.phone}</h2>
              <span>于 {formatDate(user.createdAt)} 加入知序</span>
            </div>
          </div>
          <div className="profile-detail-list">
            <div><span>登录手机号</span><strong>{user.phone}</strong><em>已绑定</em></div>
            <div><span>账号编号</span><strong>{user.id.slice(0, 8).toUpperCase()}</strong><em>唯一标识</em></div>
          </div>
        </article>

        <article className="profile-card membership-card">
          <div>
            <span className="membership-label">当前方案</span>
            <h2>知序基础版</h2>
            <p>已拥有学习计划、今日任务与进展记录的基础使用权限。</p>
          </div>
          <span className="membership-state">正常使用中</span>
        </article>

        <article className="profile-card security-card">
          <div className="profile-card-heading">
            <div><span className="profile-card-icon" aria-hidden="true">◇</span><div><h2>登录与安全</h2><p>账号凭证仅用于登录知序。</p></div></div>
          </div>
          <div className="security-row">
            <div><strong>登录密码</strong><span>密码为 6–18 个字符，并已安全加密保存。</span></div>
            <span className="security-good">保护中</span>
          </div>
          <div className="security-row">
            <div><strong>登录状态</strong><span>当前设备已登录，退出后需重新输入手机号和密码。</span></div>
            <button className="button danger-button" type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? "正在退出…" : "退出登录"}</button>
          </div>
        </article>

        <article className="profile-card profile-note-card">
          <span aria-hidden="true">i</span>
          <div><strong>账号功能第一阶段已完成</strong><p>手机号注册、密码登录、登录保持与安全退出已经接入。资料编辑和会员升级可在后续版本继续添加。</p></div>
        </article>
      </section>
    </>
  );
}
