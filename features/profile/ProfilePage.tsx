"use client";

import { FormEvent, useState } from "react";
import { useAuthUser } from "../../components/AuthSession";
import {
  SUBJECTS,
  getGrade,
  getTextbookLabel,
} from "../../config/learning-catalog";
import type { LearningProfile } from "../../lib/learning-profile";
import {
  formatExamDate,
  formatExamUnitRange,
  getDaysUntilExam,
} from "../../lib/exam-plan";
import {
  STUDY_STAGES,
  type StudyStage,
  type UserProfile,
} from "../../lib/profile-types";
import { LearningQuestionnaire } from "../onboarding/LearningQuestionnaire";

type DialogName = "profile" | "learning" | "password" | "membership" | null;

type ApiResult = {
  error?: string;
  profile?: UserProfile;
};

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));
}

function profileSummary(profile: UserProfile, learningProfile: LearningProfile) {
  return [getGrade(learningProfile.grade).label, profile.school || "学校未填写"].join(" · ");
}

export function ProfilePage({
  initialProfile,
  initialLearningProfile,
}: {
  initialProfile: UserProfile;
  initialLearningProfile: LearningProfile;
}) {
  const user = useAuthUser();
  const [profile, setProfile] = useState(initialProfile);
  const [learningProfile, setLearningProfile] = useState(initialLearningProfile);
  const [profileDraft, setProfileDraft] = useState(initialProfile);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [demoPlan, setDemoPlan] = useState("年度会员");

  function openDialog(name: Exclude<DialogName, null>) {
    if (name === "profile") setProfileDraft(profile);
    setDialog(name);
    setError("");
    setNotice("");
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setError("");
    setShowPasswords(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const displayName = profileDraft.displayName.trim();
    const school = profileDraft.school.trim();
    if (displayName.length < 1 || displayName.length > 16) {
      setError("昵称需要在 1 到 16 个字符之间。");
      return;
    }
    if (school.length > 40) {
      setError("学校或机构名称不能超过 40 个字符。");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          studyStage: profileDraft.studyStage,
          school,
        }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.profile) {
        setError(result.error ?? "资料暂时没有保存，请重试。");
        return;
      }
      setProfile(result.profile);
      setDialog(null);
      setNotice("个人资料已保存。");
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (passwords.newPassword.length < 6 || passwords.newPassword.length > 18) {
      setError("新密码长度需要在 6 到 18 个字符之间。");
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError("两次输入的新密码不一致。");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwords),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        setError(result.error ?? "密码暂时没有更新，请重试。");
        return;
      }
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setDialog(null);
      setNotice("密码已更新，其他设备上的登录已退出。");
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/");
    }
  }

  function finishMembershipDemo() {
    setDialog(null);
    setNotice(`${demoPlan}为演示选项：未产生扣款，会员状态没有改变。`);
  }

  return (
    <>
      <header className="page-heading profile-heading">
        <div>
          <p className="eyebrow">ACCOUNT & MEMBERSHIP</p>
          <h1>用户中心</h1>
          <p>管理个人资料、账号安全与会员方案。</p>
        </div>
        <div className="profile-heading-actions"><button className="button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("zhixu:open-ai", { detail: { module: "profile", prompt: "请根据我的年级、科目、教材、考试日期和考试范围，给出使用知序的设置建议。" } }))}>✦ AI 学习建议</button><span className="account-status"><i />账号状态正常</span></div>
      </header>

      {notice ? (
        <div className="profile-notice" role="status">
          <span aria-hidden="true">✓</span><strong>{notice}</strong>
          <button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button>
        </div>
      ) : null}

      <section className="profile-grid" aria-label="账号信息">
        <article className="profile-card profile-identity-card">
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">{profile.displayName.slice(0, 1)}</span>
            <div>
              <p>学习账号</p>
              <h2>{profile.displayName}</h2>
              <span>{profileSummary(profile, learningProfile)}</span>
            </div>
            <button className="button compact-button profile-edit-button" type="button" onClick={() => openDialog("profile")}>编辑资料</button>
          </div>
          <div className="profile-detail-list">
            <div><span>登录手机号</span><strong>{user.phone}</strong><em>已绑定</em></div>
            <div><span>账号编号</span><strong>{user.id.slice(0, 8).toUpperCase()}</strong><em>唯一标识</em></div>
            <div><span>注册时间</span><strong>{formatDate(user.createdAt)}</strong><em>基础资料</em></div>
          </div>
        </article>

        <article className="profile-card membership-card">
          <div>
            <span className="membership-label">当前方案</span>
            <h2>知序基础版</h2>
            <p>学习计划、今日任务与进展记录功能均可继续使用。</p>
            <div className="membership-benefits" aria-label="基础版功能">
              <span>每日任务</span><span>学习日志</span><span>进展洞察</span>
            </div>
          </div>
          <div className="membership-actions">
            <span className="membership-state">正常使用中</span>
            <button type="button" onClick={() => openDialog("membership")}>充值会员（演示）</button>
          </div>
        </article>

        <article className="profile-card learning-profile-card">
          <div className="profile-card-heading learning-profile-heading">
            <div><span className="profile-card-icon" aria-hidden="true">学</span><div><h2>学习档案</h2><p>用于匹配任务难度、学科范围和教材内容。</p></div></div>
            <button className="button compact-button" type="button" onClick={() => openDialog("learning")}>重新设置</button>
          </div>
          <div className="learning-profile-summary">
            <div className="learning-grade-badge"><small>当前年级</small><strong>{getGrade(learningProfile.grade).label}</strong><span>{getGrade(learningProfile.grade).stage}</span></div>
            <div className="learning-exam-badge"><small>计划考试</small><strong>{formatExamDate(learningProfile.examDate ?? "")}</strong><span>距离考试 {learningProfile.examDate ? getDaysUntilExam(learningProfile.examDate) : "—"} 天</span></div>
            <div className="learning-subject-list">
              {learningProfile.subjects.map((item) => (
                <div key={item.subject}><i aria-hidden="true">{SUBJECTS[item.subject].glyph}</i><span><strong>{SUBJECTS[item.subject].label}</strong><small>{getTextbookLabel(learningProfile.grade, item.subject, item.textbook)}</small><em>{formatExamUnitRange(item.subject, item.examUnitStart, item.examUnitEnd)}</em></span></div>
              ))}
            </div>
          </div>
        </article>

        <article className="profile-card security-card">
          <div className="profile-card-heading">
            <div><span className="profile-card-icon" aria-hidden="true">◇</span><div><h2>登录与安全</h2><p>管理手机号、密码和当前登录状态。</p></div></div>
          </div>
          <div className="security-row">
            <div><strong>登录手机号</strong><span>{user.phone} · 修改手机号需要短信验证，暂未开放。</span></div>
            <span className="security-good">已绑定</span>
          </div>
          <div className="security-row">
            <div><strong>登录密码</strong><span>建议定期更新密码；修改后其他设备会自动退出。</span></div>
            <button className="button compact-button" type="button" onClick={() => openDialog("password")}>修改密码</button>
          </div>
          <div className="security-row">
            <div><strong>当前设备</strong><span>本设备处于登录状态，退出后需重新输入手机号和密码。</span></div>
            <button className="button danger-button" type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? "正在退出…" : "退出登录"}</button>
          </div>
        </article>

        <article className="profile-card profile-note-card">
          <span aria-hidden="true">i</span>
          <div><strong>会员充值当前仅为界面演示</strong><p>演示按钮不会发起支付、不会扣款，也不会改变账号的会员状态；正式支付将在后续版本单独接入。</p></div>
        </article>
      </section>

      {dialog ? (
        <div className="profile-dialog-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && closeDialog()} onKeyDown={(event) => event.key === "Escape" && closeDialog()}>
          <section className={`profile-dialog${dialog === "learning" ? " learning-dialog" : ""}`} role="dialog" aria-modal="true" aria-labelledby={dialog === "learning" ? "learning-questionnaire-title" : "profile-dialog-title"}>
            <button className="profile-dialog-close" type="button" onClick={closeDialog} aria-label="关闭">×</button>

            {dialog === "profile" ? (
              <form onSubmit={saveProfile}>
                <p className="eyebrow">PERSONAL PROFILE</p>
                <h2 id="profile-dialog-title">编辑个人资料</h2>
                <p className="dialog-intro">这些信息用于个性化学习计划，不会改变登录手机号。</p>
                {error ? <div className="auth-message error" role="alert"><span>!</span>{error}</div> : null}
                <label className="profile-form-field"><span>昵称</span><input value={profileDraft.displayName} maxLength={16} onChange={(event) => setProfileDraft((value) => ({ ...value, displayName: event.target.value }))} placeholder="例如：小序" autoFocus /></label>
                <label className="profile-form-field"><span>学习阶段</span><select value={profileDraft.studyStage} onChange={(event) => setProfileDraft((value) => ({ ...value, studyStage: event.target.value as StudyStage }))}><option value="">暂不设置</option>{STUDY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>
                <label className="profile-form-field"><span>学校或机构</span><input value={profileDraft.school} maxLength={40} onChange={(event) => setProfileDraft((value) => ({ ...value, school: event.target.value }))} placeholder="选填" /></label>
                <div className="profile-dialog-actions"><button className="button" type="button" onClick={closeDialog}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存资料"}</button></div>
              </form>
            ) : null}

            {dialog === "learning" ? (
              <LearningQuestionnaire
                variant="embedded"
                initialProfile={learningProfile}
                onCancel={closeDialog}
                onComplete={(nextProfile) => {
                  setLearningProfile(nextProfile);
                  setProfile((current) => ({
                    ...current,
                    studyStage: getGrade(nextProfile.grade).label as StudyStage,
                  }));
                  setDialog(null);
                  setNotice("学习档案已更新，后续计划会使用新的考试日期、Unit 范围和教材信息。");
                }}
              />
            ) : null}

            {dialog === "password" ? (
              <form onSubmit={changePassword}>
                <p className="eyebrow">LOGIN SECURITY</p>
                <h2 id="profile-dialog-title">修改登录密码</h2>
                <p className="dialog-intro">新密码需要 6–18 个字符，保存后其他设备会退出登录。</p>
                {error ? <div className="auth-message error" role="alert"><span>!</span>{error}</div> : null}
                <label className="profile-form-field"><span>当前密码</span><input type={showPasswords ? "text" : "password"} autoComplete="current-password" value={passwords.currentPassword} maxLength={18} onChange={(event) => setPasswords((value) => ({ ...value, currentPassword: event.target.value }))} autoFocus /></label>
                <label className="profile-form-field"><span>新密码 <small>6–18 个字符</small></span><input type={showPasswords ? "text" : "password"} autoComplete="new-password" value={passwords.newPassword} maxLength={18} onChange={(event) => setPasswords((value) => ({ ...value, newPassword: event.target.value }))} /></label>
                <label className="profile-form-field"><span>再次输入新密码</span><input type={showPasswords ? "text" : "password"} autoComplete="new-password" value={passwords.confirmPassword} maxLength={18} onChange={(event) => setPasswords((value) => ({ ...value, confirmPassword: event.target.value }))} /></label>
                <label className="password-visibility"><input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />显示密码</label>
                <div className="profile-dialog-actions"><button className="button" type="button" onClick={closeDialog}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy ? "正在更新…" : "更新密码"}</button></div>
              </form>
            ) : null}

            {dialog === "membership" ? (
              <div>
                <p className="eyebrow">MEMBERSHIP DEMO</p>
                <h2 id="profile-dialog-title">选择会员方案</h2>
                <p className="dialog-intro">当前为产品演示，不会跳转支付，也不会产生任何费用。</p>
                <div className="membership-demo-plans">
                  {["月度会员", "年度会员"].map((plan) => (
                    <button key={plan} className={demoPlan === plan ? "selected" : ""} type="button" onClick={() => setDemoPlan(plan)}><span>{plan}</span><strong>{plan === "年度会员" ? "推荐体验" : "灵活选择"}</strong><i>{demoPlan === plan ? "✓" : ""}</i></button>
                  ))}
                </div>
                <div className="membership-demo-benefits"><strong>规划中的会员权益</strong><span>更多动态调整次数</span><span>更完整的 AI Tutor 使用额度</span><span>长期学习趋势报告</span></div>
                <button className="button primary membership-demo-submit" type="button" onClick={finishMembershipDemo}>模拟确认（不会扣款）</button>
                <p className="membership-demo-disclaimer">这是一个假按钮，仅用于确认会员页面交互。</p>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
