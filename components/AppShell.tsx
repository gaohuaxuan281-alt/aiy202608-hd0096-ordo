"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navigation } from "../config/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
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
          <Link className="brand" href="/" aria-label="知序首页">
            <span className="brand-mark" aria-hidden="true">序</span>
            <span className="brand-name">知序 <span className="brand-version">FRAME</span></span>
          </Link>

          <div className="exam-switcher">
            <div><small>当前考试 · 8 天</small><strong>高二上学期期中</strong></div>
            <span aria-hidden="true">⌄</span>
          </div>

          <nav className="sidebar-nav" aria-label="主导航">
            {navigation.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                  <span className="nav-icon" aria-hidden="true">{item.glyph}</span>
                  <span>{item.label}</span>
                  {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="sync-status"><span className="sync-dot" /><span><strong>框架已同步</strong><br />8 个模块已就绪</span></div>
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
    </div>
  );
}
