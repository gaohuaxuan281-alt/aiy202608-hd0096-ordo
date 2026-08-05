"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { navigation } from "../config/navigation";
import { SUBJECTS } from "../config/learning-catalog";
import type { AuthUser } from "../lib/auth";
import { getDaysUntilExam } from "../lib/exam-plan";
import type { LearningProfile } from "../lib/learning-profile";
import { AuthSessionProvider } from "./AuthSession";
import { GlobalAIAssistant } from "./GlobalAIAssistant";

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)} ···· ${phone.slice(-4)}`;
}

export function AppShell({
  children,
  user,
  learningProfile,
}: {
  children: React.ReactNode;
  user: AuthUser;
  learningProfile: LearningProfile;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const examDays = learningProfile.examDate ? getDaysUntilExam(learningProfile.examDate) : 0;
  const examLabel = learningProfile.subjects.length === 1
    ? `${SUBJECTS[learningProfile.subjects[0].subject].label}考试`
    : `${learningProfile.subjects.length} 科考试计划`;

  return (
    <AuthSessionProvider user={user}>
      <div className="app-frame">
      <header className="window-bar">
        <div className="traffic-lights" aria-hidden="true"><span /><span /><span /></div>
        <div className="window-title">知序 · <em>Study Flow</em></div>
        <div className="window-actions">
          <button className="icon-button" type="button" aria-label="全局搜索" onClick={() => setSearchOpen(true)}>⌕</button>
          <Link className="icon-button" href="/todo" aria-label="新建任务">＋</Link>
        </div>
      </header>

      <div className="shell-body">
        <aside className={`sidebar${menuOpen ? " open" : ""}`}>
          <Link className="brand" href="/" aria-label="知序首页" onClick={() => setMenuOpen(false)}>
            <span className="brand-mark" aria-hidden="true">序</span>
            <span className="brand-name">知序 <span className="brand-version">FRAME</span></span>
          </Link>

          <div className="exam-switcher">
            <div><small>当前考试 · {examDays} 天</small><strong>{examLabel}</strong></div>
            <span aria-hidden="true">⌄</span>
          </div>

          <nav className="sidebar-nav" aria-label="主导航">
            {navigation.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                  <span className="nav-icon" aria-hidden="true">{item.glyph}</span>
                  <span>{item.label}</span>
                  {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <Link className="sidebar-account" href="/profile" aria-label="打开用户中心" onClick={() => setMenuOpen(false)}>
              <span className="sidebar-avatar" aria-hidden="true">学</span>
              <span><strong>我的账号</strong><small>{maskPhone(user.phone)}</small></span>
              <b aria-hidden="true">›</b>
            </Link>
            <div className="sync-status"><span className="sync-dot" /><span><strong>学习数据已同步</strong><br />账号状态正常</span></div>
          </div>
        </aside>

        <main className="main-area">{children}</main>
      </div>

      <button className="mobile-menu-button" type="button" aria-label={menuOpen ? "关闭菜单" : "打开菜单"} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? "×" : "☰"}</button>

      {searchOpen ? (
        <div className="search-dialog" role="dialog" aria-modal="true" aria-label="全局搜索" onMouseDown={(event) => event.currentTarget === event.target && setSearchOpen(false)}>
          <div className="search-panel">
            <input autoFocus placeholder="搜索任务、日志、反馈或洞察…" aria-label="搜索内容" onKeyDown={(event) => event.key === "Escape" && setSearchOpen(false)} />
            <div className="search-help"><span>框架搜索入口 · 等待业务模块接入</span><span>Esc 关闭</span></div>
          </div>
        </div>
      ) : null}
      <GlobalAIAssistant />
      </div>
    </AuthSessionProvider>
  );
}
