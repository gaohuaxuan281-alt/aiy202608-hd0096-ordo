import Link from "next/link";

export function HomePage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">2026 年 8 月 4 日 · 周二</p>
          <h1>晚上好，先看最重要的事。</h1>
          <p>根据考试日期、剩余时间和掌握程度，拆解每日复习任务并动态调整。</p>
        </div>
        <div className="heading-actions">
          <button className="button" type="button">⌕&nbsp; 搜索</button>
          <Link className="button primary" href="/todo">＋ 新建任务</Link>
        </div>
      </header>

      <section className="change-banner" aria-labelledby="change-title">
        <div>
          <h2 id="change-title">现实变化</h2>
          <strong>实验报告临时占用 19:20–20:20</strong>
        </div>
        <div className="banner-metric"><span>今晚可用时间</span><b>90 → 30 分钟</b></div>
        <div className="banner-metric"><span>最小调整</span><b>拆分 1 · 移动 1</b></div>
        <div className="banner-metric"><span>硬边界</span><b>睡眠时间不变</b></div>
        <Link className="button primary" href="/timeline">预览新计划 →</Link>
      </section>

      <section className="dashboard-grid" aria-label="今日学习总览">
        <article className="exam-hero">
          <div className="pill-row"><span className="pill">当前考试</span><span className="pill teal">动态计划</span></div>
          <h2>高二上学期期中考试</h2>
          <p>8 月 12 日 09:00 · 距离考试</p>
          <div className="countdown"><strong>8</strong><span>天</span></div>
          <Link className="exam-link" href="/timeline">打开复习 Timeline →</Link>
        </article>

        <article className="current-card">
          <p className="section-kicker">现在</p>
          <h2>下一项 · 物理</h2>
          <div className="progress-meta"><strong>已安排 90 分钟</strong><span>容量 150 分钟</span></div>
          <div className="progress-track" aria-label="今日计划进度 71%"><div className="progress-value" /></div>
          <div className="task-block">
            <span className="task-time">19:20–19:35</span>
            <div className="task-copy"><strong>独立完成平抛运动 2 题</strong><span>15 分钟 · 从原任务拆分</span></div>
            <span className="task-status">进行中</span>
          </div>
          <div className="risk-strip"><span><small>今日最大风险</small><strong>物理任务连续两次超时</strong></span><Link href="/todo">检查任务 →</Link></div>
        </article>

        <div className="stats-grid">
          <article className="stat-card"><span>计划完成度</span><strong>76%</strong><div className="mini-bar" /></article>
          <article className="stat-card"><span>待确认调整</span><strong>3</strong><Link href="/todo">打开任务队列 →</Link></article>
          <article className="stat-card"><span>本周动态调整</span><strong>3 次</strong><div className="spark-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div></article>
          <article className="stat-card"><span>学习状态</span><strong style={{ color: "var(--teal)" }}>已同步</strong><Link href="/insights">查看进展洞察 →</Link></article>
        </div>
      </section>
    </>
  );
}
