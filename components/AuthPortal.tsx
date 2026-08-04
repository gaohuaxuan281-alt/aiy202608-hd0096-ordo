"use client";

import { FormEvent, useId, useState } from "react";

type AuthMode = "login" | "register";

function normalizePhone(value: string) {
  return value.replace(/[\s-]/g, "");
}

export function AuthPortal() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const phoneId = useId();
  const passwordId = useId();
  const confirmId = useId();

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
    setShowPassword(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedPhone = normalizePhone(phone);
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      setError("请输入正确的 11 位中国大陆手机号。");
      return;
    }
    if (password.length < 6 || password.length > 18) {
      setError("密码长度需要在 6 到 18 个字符之间。");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致，请重新确认。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: normalizedPhone,
          password,
          ...(mode === "register" ? { confirmPassword } : {}),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "操作没有完成，请重试。");
        return;
      }

      if (mode === "register") {
        setPhone(normalizedPhone);
        setPassword("");
        setConfirmPassword("");
        setMode("login");
        setNotice("注册成功，请使用刚才的手机号和密码登录。");
        return;
      }

      window.location.replace("/");
    } catch {
      setError("网络连接异常，请检查网络后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-story" aria-label="知序产品介绍">
          <div className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">序</span>
            <span>知序</span>
            <small>STUDY FLOW</small>
          </div>
          <div className="auth-story-copy">
            <p className="auth-kicker">考前学习任务设计器</p>
            <h1>把考试倒计时，变成今天做得完的事。</h1>
            <p>根据考试日期、剩余时间和掌握程度，拆解每日复习任务并动态调整。</p>
          </div>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-head"><span>距离期中考试</span><strong>8 天</strong></div>
            <div className="auth-preview-line"><i /><i /><i /><i /><i /></div>
            <div className="auth-preview-task"><b>19:20</b><span>完成平抛运动练习</span><em>15 分钟</em></div>
          </div>
          <p className="auth-footnote">计划会变化，目标始终清晰。</p>
        </section>

        <section className="auth-form-side">
          <div className="auth-form-wrap">
            <div className="auth-mobile-brand" aria-hidden="true"><span>序</span> 知序</div>
            <p className="eyebrow">WELCOME TO ZHIXU</p>
            <h2>{mode === "login" ? "欢迎回来" : "创建你的学习账号"}</h2>
            <p className="auth-form-intro">
              {mode === "login" ? "登录后继续查看今天的复习安排。" : "只需手机号和密码，即可开始使用。"}
            </p>

            <div className="auth-tabs" role="tablist" aria-label="登录或注册">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>登录</button>
              <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>注册</button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              {notice ? <div className="auth-message success" role="status"><span aria-hidden="true">✓</span>{notice}</div> : null}
              {error ? <div className="auth-message error" role="alert"><span aria-hidden="true">!</span>{error}</div> : null}

              <div className="auth-field">
                <label htmlFor={phoneId}>手机号</label>
                <div className="auth-input-wrap">
                  <span className="auth-prefix">+86</span>
                  <input id={phoneId} type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/[^\d\s-]/g, "").slice(0, 15))} placeholder="请输入 11 位手机号" disabled={submitting} />
                </div>
              </div>

              <div className="auth-field">
                <div className="auth-label-row"><label htmlFor={passwordId}>密码</label><span>6–18 个字符</span></div>
                <div className="auth-input-wrap">
                  <input id={passwordId} type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value.slice(0, 18))} placeholder={mode === "login" ? "请输入密码" : "设置登录密码"} disabled={submitting} />
                  <button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? "隐藏" : "显示"}</button>
                </div>
              </div>

              {mode === "register" ? (
                <div className="auth-field">
                  <label htmlFor={confirmId}>再次输入密码</label>
                  <div className="auth-input-wrap">
                    <input id={confirmId} type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value.slice(0, 18))} placeholder="再次输入，避免手误" disabled={submitting} />
                  </div>
                </div>
              ) : null}

              <button className="auth-submit" type="submit" disabled={submitting}>
                {submitting ? "正在处理…" : mode === "login" ? "登录并进入知序" : "完成注册"}
                {!submitting ? <span aria-hidden="true">→</span> : null}
              </button>
            </form>

            <p className="auth-switch-copy">
              {mode === "login" ? "还没有账号？" : "已经有账号？"}
              <button type="button" onClick={() => switchMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "立即注册" : "返回登录"}</button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
