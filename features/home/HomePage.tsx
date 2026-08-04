"use client";

import Link from "next/link";
import type { HomeDashboardSnapshot, HomeTaskStatus } from "./home-types";

const taskStatusLabels: Record<HomeTaskStatus, string> = {
  ready: "待开始",
  in_progress: "进行中",
  blocked: "有阻塞",
};

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function dispatchAI(module: "home" | "ai-tutor", prompt?: string) {
  window.dispatchEvent(new CustomEvent("zhixu:open-ai", { detail: { module, prompt } }));
}

export function HomePage({ snapshot }: { snapshot: HomeDashboardSnapshot }) {
  const { timeline, todo, tutor, summary, insights } = snapshot;
  const { exam, nextTask, risk, recentChanges, pendingAdjustments } = timeline;
  const { today } = todo;
  const feedback = summary.feedback;

  return (
    <div className="home-dashboard">
      <header className="page-heading home-heading">
        <div>
          <p className="eyebrow">{snapshot.dateLabel}</p>
          <h1>{snapshot.greeting}，先看最重要的事。</h1>
          <p>今天发生了什么、现在该做什么、有没有需要处理的变化，都集中在这里。</p>
        </div>
        <div className="heading-actions">
          <button className="button" type="button" onClick={() => dispatchAI("home")}>✦&nbsp; 问知序 AI</button>
          <Link className="button primary" href="/todo?intent=create">＋ 新建任务</Link>
        </div>
      </header>

      <section className="change-banner home-change-banner" aria-labelledby="change-title">
        <div>
          <span className="home-banner-label">最近的计划变化</span>
          <h2 id="change-title">{recentChanges[0]?.title ?? "计划暂无变化"}</h2>
          <p>{recentChanges[0]?.description ?? "Timeline 更新后会自动显示在这里。"}</p>
        </div>
        <div className="banner-metric"><span>今晚可用时间</span><b>{today.originalAvailableMinutes} → {today.remainingAvailableMinutes} 分钟</b></div>
        <div className="banner-metric"><span>待确认调整</span><b>{pendingAdjustments.length} 项建议</b></div>
        <div className="banner-metric"><span>硬边界</span><b>睡眠时间不变</b></div>
        <Link className="button primary" href="/timeline?view=adjustments">预览新计划 →</Link>
      </section>

      <section className="dashboard-grid" aria-label="今日学习总览">
        <article className="exam-hero">
          <div className="pill-row"><span className="pill">当前考试</span><span className="pill teal">{exam.planStatusLabel}</span></div>
          <h2>{exam.name}</h2>
          <p>{exam.dateLabel} · 距离考试</p>
          <div className="countdown"><strong>{exam.daysRemaining}</strong><span>天</span></div>
          <div className="exam-progress-caption"><span>周期总体完成度</span><b>{insights.subjects.length ? Math.round(insights.subjects.reduce((total, item) => total + item.completionPercent, 0) / insights.subjects.length) : 0}%</b></div>
          <Link className="exam-link" href="/timeline">打开复习 Timeline →</Link>
        </article>

        <article className="current-card">
          <div className="home-card-heading">
            <div><p className="section-kicker">现在该做什么</p><h2>下一项 · {nextTask.subject}</h2></div>
            <Link href="/todo">今日全部任务 →</Link>
          </div>
          <div className="progress-meta"><strong>已完成 {today.completedTasks}/{today.totalTasks} 项 · {formatMinutes(today.completedMinutes)}</strong><span>计划 {formatMinutes(today.plannedMinutes)}</span></div>
          <div className="progress-track" aria-label={`今日计划进度 ${today.completionPercent}%`}><div className="progress-value" style={{ width: `${today.completionPercent}%` }} /></div>
          <Link className="task-block" href={`/todo?task=${encodeURIComponent(nextTask.id)}`}>
            <span className="task-time">{nextTask.timeLabel}</span>
            <div className="task-copy"><strong>{nextTask.title}</strong><span>{nextTask.durationMinutes} 分钟 · {nextTask.sourceLabel}</span><small>{nextTask.completionCriteria}</small></div>
            <span className={`task-status ${nextTask.status}`}>{taskStatusLabels[nextTask.status]}</span>
          </Link>
          <div className={`risk-strip ${risk.level}`}><span><small>当前最大风险</small><strong>{risk.title}</strong><em>{risk.description}</em></span><Link href={risk.actionHref}>{risk.actionLabel} →</Link></div>
        </article>

        <div className="stats-grid">
          <article className="stat-card"><span>今日完成进度</span><strong>{today.completionPercent}%</strong><div className="mini-bar"><i style={{ width: `${today.completionPercent}%` }} /></div><small>{today.completedTasks} 项已完成，{today.totalTasks - today.completedTasks} 项待处理</small></article>
          <article className="stat-card"><span>今天剩余可用时间</span><strong>{formatMinutes(today.remainingAvailableMinutes)}</strong><div className="stat-delta warning">较原计划减少 {today.originalAvailableMinutes - today.remainingAvailableMinutes} 分钟</div></article>
          <article className="stat-card"><span>待确认调整</span><strong>{pendingAdjustments.length}</strong><Link href="/timeline?view=adjustments">进入 Timeline 确认 →</Link><small>首页不会直接修改权威计划</small></article>
          <article className="stat-card"><span>本周动态调整</span><strong>{timeline.weeklyAdjustmentCount} 次</strong><div className="spark-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div><small>{insights.overallStatusLabel}</small></article>
        </div>
      </section>

      <section className="home-section-heading" aria-labelledby="progress-heading">
        <div><p className="section-kicker">跨模块总览</p><h2 id="progress-heading">进展、变化与下一步</h2></div>
        <Link href="/insights">打开完整进展洞察 →</Link>
      </section>

      <section className="home-detail-grid" aria-label="跨模块学习信息">
        <article className="home-panel subject-progress-panel">
          <header className="home-panel-header"><div><span>进展洞察</span><h3>各科进展摘要</h3></div><Link href="/insights">查看全部</Link></header>
          <div className="subject-progress-list">
            {insights.subjects.map((item) => (
              <div className="subject-progress-row" key={item.id}>
                <div className="subject-progress-top"><span className={`subject-dot ${item.tone}`} /><strong>{item.subject}</strong><span>{formatMinutes(item.completedMinutes)} / {formatMinutes(item.plannedMinutes)}</span><b>{item.completionPercent}%</b></div>
                <div className="subject-progress-track"><i className={item.tone} style={{ width: `${item.completionPercent}%` }} /></div>
                <div className="subject-progress-meta"><span>趋势 {item.trendLabel}</span><span>{item.riskLabel}</span></div>
              </div>
            ))}
          </div>
        </article>

        <article className="home-panel adjustment-panel">
          <header className="home-panel-header"><div><span>需要你处理</span><h3>{pendingAdjustments.length} 项计划调整待确认</h3></div><span className="home-count-badge">{pendingAdjustments.length}</span></header>
          <div className="adjustment-list">
            {pendingAdjustments.map((item, index) => (
              <div className="adjustment-row" key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.description}</p></div><em>{item.impactLabel}</em></div>
            ))}
          </div>
          <Link className="button primary home-panel-action" href="/timeline?view=adjustments">查看修改内容与原因</Link>
          <p className="home-boundary-note">只有在 Timeline 中确认后，调整才会正式写入计划。</p>
        </article>

        <article className="home-panel changes-panel">
          <header className="home-panel-header"><div><span>日志 + Timeline</span><h3>最近发生的计划变化</h3></div><Link href="/journal">打开日志</Link></header>
          <div className="change-list">
            {recentChanges.map((item) => (
              <Link className="change-row" href={item.href} key={item.id}><time>{item.happenedAtLabel}</time><span /><div><strong>{item.title}</strong><p>{item.description}</p><small>{item.actorLabel}</small></div><b>→</b></Link>
            ))}
          </div>
        </article>

        <article className="home-panel tutor-entry-panel">
          <header className="home-panel-header light"><div><span>即时答疑</span><h3>AI Tutor 快速入口</h3></div><span className="tutor-home-orb" aria-hidden="true">✦</span></header>
          <p>带着下一项任务进入 AI Tutor，快速解释知识点、检查思路或生成练习。</p>
          <div className="tutor-context-chip"><small>将自动携带</small><strong>{nextTask.subject} · {nextTask.title}</strong><span>{nextTask.completionCriteria}</span></div>
          <div className="home-ai-prompts">
            {tutor.quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => dispatchAI("ai-tutor", prompt)}>{prompt}<span>↗</span></button>)}
          </div>
          <Link className="home-dark-link" href="/ai-tutor">打开完整 AI Tutor →</Link>
        </article>

        <article className={`home-panel feedback-panel ${feedback.status}`}>
          <header className="home-panel-header"><div><span>每日反馈总结</span><h3>{feedback.title}</h3></div><span className="feedback-status">{feedback.status === "completed" ? "已完成" : "待完成"}</span></header>
          <p>{feedback.description}</p>
          <div className="feedback-progress"><div><span>剩余引导问题</span><strong>{feedback.questionsRemaining}</strong></div><div><span>建议时间</span><strong>{feedback.dueLabel}</strong></div></div>
          <Link className="button home-panel-action" href="/summary">开始今日反馈总结 →</Link>
        </article>

        <article className="home-panel quick-actions-panel">
          <header className="home-panel-header"><div><span>快捷操作</span><h3>从首页前往下一步</h3></div></header>
          <div className="home-quick-actions">
            <Link href="/todo?intent=create"><span>＋</span><div><strong>快速新建任务</strong><small>创建后由 Todo 和 Timeline 接管</small></div><b>→</b></Link>
            <Link href="/timeline"><span>⌁</span><div><strong>进入 Timeline</strong><small>查看权威计划和完整时间轴</small></div><b>→</b></Link>
            <Link href="/todo"><span>✓</span><div><strong>进入今日 Todo</strong><small>执行、完成并同步今日任务</small></div><b>→</b></Link>
            <button type="button" onClick={() => dispatchAI("home", "根据首页当前信息，告诉我现在最值得先处理的三件事。") }><span>✦</span><div><strong>让 AI 判断下一步</strong><small>根据首页聚合信息给出建议</small></div><b>↗</b></button>
          </div>
        </article>
      </section>
    </div>
  );
}
