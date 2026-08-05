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

function EmptyModuleState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="home-module-empty">
      <span aria-hidden="true">○</span>
      <div><strong>{title}</strong><p>{description}</p></div>
      <Link href={href}>{action} →</Link>
    </div>
  );
}

export function HomePage({ snapshot }: { snapshot: HomeDashboardSnapshot }) {
  const { timeline, todo, tutor, summary, insights, diagnostic } = snapshot;
  const { exam, nextTask, risk, recentChanges, pendingAdjustments } = timeline;
  const { today } = todo;
  const feedback = summary.feedback;
  const latestActivity = recentChanges[0];
  const hasStats = Boolean(
    today || diagnostic || pendingAdjustments.length || timeline.weeklyAdjustmentCount !== null,
  );

  return (
    <div className="home-dashboard">
      <header className="page-heading home-heading">
        <div>
          <p className="eyebrow">{snapshot.dateLabel}</p>
          <h1>{snapshot.greeting}，先看最重要的事。</h1>
          <p>首页只呈现已经保存的真实信息。未接入的数据会保持空状态，不使用演示数字。</p>
        </div>
        <div className="heading-actions">
          <button className="button" type="button" onClick={() => dispatchAI("home")}>✦&nbsp; 问知序 AI</button>
          <Link className="button primary" href="/todo?intent=create">＋ 新建任务</Link>
        </div>
      </header>

      {latestActivity ? (
        <section className="change-banner home-change-banner has-activity" aria-labelledby="activity-title">
          <div>
            <span className="home-banner-label">最近真实操作</span>
            <h2 id="activity-title">{latestActivity.title}</h2>
            <p>{latestActivity.description}</p>
          </div>
          <div className="banner-metric"><span>记录时间</span><b>{latestActivity.happenedAtLabel}</b></div>
          <Link className="button primary" href="/journal">查看日志 →</Link>
        </section>
      ) : null}

      <section className="dashboard-grid" aria-label="今日学习总览">
        {exam ? (
          <article className="exam-hero">
            <div className="pill-row"><span className="pill">当前考试</span><span className="pill teal">{exam.planStatusLabel}</span></div>
            <h2>{exam.name}</h2>
            <p>{exam.dateLabel} · 距离考试</p>
            <div className="countdown"><strong>{exam.daysRemaining}</strong><span>天</span></div>
            {diagnostic ? (
              <div className="exam-progress-caption"><span>最近诊断 Quiz</span><b>{diagnostic.score}/{diagnostic.total} · {diagnostic.percentage}%</b></div>
            ) : null}
            <Link className="exam-link" href="/timeline">打开复习 Timeline →</Link>
          </article>
        ) : (
          <article className="current-card exam-empty-card">
            <div className="home-card-heading"><div><p className="section-kicker">当前考试</p><h2>尚未保存考试信息</h2></div></div>
            <EmptyModuleState title="没有考试数据" description="完成学习档案后，这里会显示真实考试日期和倒计时。" href="/profile" action="前往用户中心" />
          </article>
        )}

        <article className="current-card">
          <div className="home-card-heading">
            <div><p className="section-kicker">现在该做什么</p><h2>{nextTask ? `下一项 · ${nextTask.subject}` : "暂无今日任务"}</h2></div>
            <Link href="/todo">今日全部任务 →</Link>
          </div>
          {today ? (
            <>
              <div className="progress-meta"><strong>已完成 {today.completedTasks}/{today.totalTasks} 项 · {formatMinutes(today.completedMinutes)}</strong><span>计划 {formatMinutes(today.plannedMinutes)}</span></div>
              <div className="progress-track" aria-label={`今日计划进度 ${today.completionPercent}%`}><div className="progress-value" style={{ width: `${today.completionPercent}%` }} /></div>
            </>
          ) : null}
          {nextTask ? (
            <Link className="task-block" href={`/todo?task=${encodeURIComponent(nextTask.id)}`}>
              <span className="task-time">{nextTask.timeLabel}</span>
              <div className="task-copy"><strong>{nextTask.title}</strong><span>{nextTask.durationMinutes} 分钟 · {nextTask.sourceLabel}</span><small>{nextTask.completionCriteria}</small></div>
              <span className={`task-status ${nextTask.status}`}>{taskStatusLabels[nextTask.status]}</span>
            </Link>
          ) : (
            <EmptyModuleState title="Todo 暂无可展示任务" description="Todo 模块保存真实任务后，下一项任务和完成进度会自动出现在这里。" href="/todo" action="打开 Todo" />
          )}
          {risk ? (
            <div className={`risk-strip ${risk.level}`}><span><small>当前最大风险</small><strong>{risk.title}</strong><em>{risk.description}</em></span><Link href={risk.actionHref}>{risk.actionLabel} →</Link></div>
          ) : null}
        </article>

        {hasStats ? (
          <div className="stats-grid">
            {today ? <article className="stat-card"><span>今日完成进度</span><strong>{today.completionPercent}%</strong><div className="mini-bar"><i style={{ width: `${today.completionPercent}%` }} /></div><small>{today.completedTasks} 项已完成，{today.totalTasks - today.completedTasks} 项待处理</small></article> : null}
            {today ? <article className="stat-card"><span>今天剩余可用时间</span><strong>{formatMinutes(today.remainingAvailableMinutes)}</strong><small>Todo 当前保存的可用时间</small></article> : null}
            {diagnostic ? <article className="stat-card"><span>最近诊断成绩</span><strong>{diagnostic.score}/{diagnostic.total}</strong><div className="mini-bar"><i style={{ width: `${diagnostic.percentage}%` }} /></div><small>{diagnostic.completedAtLabel} 完成</small></article> : null}
            {diagnostic?.weakTopics.length ? <article className="stat-card"><span>诊断薄弱知识点</span><strong>{diagnostic.weakTopics.length}</strong><Link href="/profile">查看诊断结果 →</Link><small>将作为 AI 制定复习建议的输入</small></article> : null}
            {pendingAdjustments.length ? <article className="stat-card"><span>待确认调整</span><strong>{pendingAdjustments.length}</strong><Link href="/timeline?view=adjustments">进入 Timeline 确认 →</Link><small>首页不会直接修改权威计划</small></article> : null}
            {timeline.weeklyAdjustmentCount !== null ? <article className="stat-card"><span>本周动态调整</span><strong>{timeline.weeklyAdjustmentCount} 次</strong>{insights.overallStatusLabel ? <small>{insights.overallStatusLabel}</small> : null}</article> : null}
          </div>
        ) : null}
      </section>

      <section className="home-section-heading" aria-labelledby="progress-heading">
        <div><p className="section-kicker">跨模块真实数据</p><h2 id="progress-heading">进展、操作与下一步</h2></div>
        <Link href="/insights">打开完整进展洞察 →</Link>
      </section>

      <section className="home-detail-grid" aria-label="跨模块学习信息">
        <article className="home-panel subject-progress-panel">
          <header className="home-panel-header"><div><span>进展洞察</span><h3>{diagnostic ? "诊断 Quiz 分科结果" : "各科进展摘要"}</h3></div><Link href="/insights">查看全部</Link></header>
          {diagnostic ? (
            <div className="subject-progress-list">
              {diagnostic.subjectScores.map((item) => (
                <div className="subject-progress-row" key={item.subject}>
                  <div className="subject-progress-top diagnostic"><span className="subject-dot indigo" /><strong>{item.subject}</strong><span>{item.correct}/{item.total} 题</span><b>{item.percentage}%</b></div>
                  <div className="subject-progress-track"><i className="indigo" style={{ width: `${item.percentage}%` }} /></div>
                </div>
              ))}
            </div>
          ) : insights.subjects.length ? (
            <div className="subject-progress-list">
              {insights.subjects.map((item) => (
                <div className="subject-progress-row" key={item.id}>
                  <div className="subject-progress-top"><span className={`subject-dot ${item.tone}`} /><strong>{item.subject}</strong><span>{formatMinutes(item.completedMinutes)} / {formatMinutes(item.plannedMinutes)}</span><b>{item.completionPercent}%</b></div>
                  <div className="subject-progress-track"><i className={item.tone} style={{ width: `${item.completionPercent}%` }} /></div>
                  <div className="subject-progress-meta"><span>趋势 {item.trendLabel}</span><span>{item.riskLabel}</span></div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyModuleState title="暂无进展数据" description="进展洞察模块产生真实统计后，这里才会展示学科进度。" href="/insights" action="打开进展洞察" />
          )}
        </article>

        <article className="home-panel adjustment-panel">
          <header className="home-panel-header"><div><span>需要你处理</span><h3>{pendingAdjustments.length ? `${pendingAdjustments.length} 项计划调整待确认` : "暂无待确认调整"}</h3></div>{pendingAdjustments.length ? <span className="home-count-badge">{pendingAdjustments.length}</span> : null}</header>
          {pendingAdjustments.length ? (
            <>
              <div className="adjustment-list">
                {pendingAdjustments.map((item, index) => (
                  <div className="adjustment-row" key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.description}</p></div><em>{item.impactLabel}</em></div>
                ))}
              </div>
              <Link className="button primary home-panel-action" href="/timeline?view=adjustments">查看修改内容与原因</Link>
              <p className="home-boundary-note">只有在 Timeline 中确认后，调整才会正式写入计划。</p>
            </>
          ) : <EmptyModuleState title="Timeline 尚未提出调整" description="这里不会预填调整建议；真实建议产生后才会显示。" href="/timeline" action="打开 Timeline" />}
        </article>

        <article className="home-panel changes-panel">
          <header className="home-panel-header"><div><span>日志</span><h3>最近真实操作记录</h3></div><Link href="/journal">打开日志</Link></header>
          {recentChanges.length ? (
            <div className="change-list">
              {recentChanges.map((item) => (
                <Link className="change-row" href={item.href} key={item.id}><time>{item.happenedAtLabel}</time><span /><div><strong>{item.title}</strong><p>{item.description}</p><small>{item.actorLabel}</small></div><b>→</b></Link>
              ))}
            </div>
          ) : <EmptyModuleState title="暂无操作日志" description="完成注册以外的学习操作后，真实记录会显示在这里。" href="/journal" action="打开日志" />}
        </article>

        <article className="home-panel tutor-entry-panel">
          <header className="home-panel-header light"><div><span>即时答疑</span><h3>AI Tutor 快速入口</h3></div><span className="tutor-home-orb" aria-hidden="true">✦</span></header>
          <p>AI 会读取已保存的考试范围和诊断结果；没有的数据不会作为上下文传入。</p>
          {diagnostic?.weakTopics.length ? (
            <div className="tutor-context-chip"><small>当前可用的薄弱知识点</small><strong>{diagnostic.weakTopics.slice(0, 3).map((item) => `${item.subject} · ${item.knowledgePoint}`).join(" / ")}</strong><span>来自最近一次 10 题诊断 Quiz</span></div>
          ) : null}
          <div className="home-ai-prompts">
            {tutor.quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => dispatchAI("ai-tutor", prompt)}>{prompt}<span>↗</span></button>)}
          </div>
          <Link className="home-dark-link" href="/ai-tutor">打开完整 AI Tutor →</Link>
        </article>

        <article className={`home-panel feedback-panel${feedback ? ` ${feedback.status}` : ""}`}>
          <header className="home-panel-header"><div><span>每日反馈总结</span><h3>{feedback ? feedback.title : "暂无今日反馈数据"}</h3></div>{feedback ? <span className="feedback-status">{feedback.status === "completed" ? "已完成" : "待完成"}</span> : null}</header>
          {feedback ? (
            <>
              <p>{feedback.description}</p>
              <div className="feedback-progress"><div><span>剩余引导问题</span><strong>{feedback.questionsRemaining}</strong></div><div><span>建议时间</span><strong>{feedback.dueLabel}</strong></div></div>
              <Link className="button home-panel-action" href="/summary">开始今日反馈总结 →</Link>
            </>
          ) : <EmptyModuleState title="反馈总结尚未产生记录" description="反馈总结模块保存真实状态后，这里才会显示提醒。" href="/summary" action="打开反馈总结" />}
        </article>

        <article className="home-panel quick-actions-panel">
          <header className="home-panel-header"><div><span>快捷操作</span><h3>从首页前往下一步</h3></div></header>
          <div className="home-quick-actions">
            <Link href="/todo?intent=create"><span>＋</span><div><strong>快速新建任务</strong><small>创建后由 Todo 和 Timeline 接管</small></div><b>→</b></Link>
            <Link href="/timeline"><span>⌁</span><div><strong>进入 Timeline</strong><small>查看真实计划和完整时间轴</small></div><b>→</b></Link>
            <Link href="/todo"><span>✓</span><div><strong>进入今日 Todo</strong><small>执行、完成并同步今日任务</small></div><b>→</b></Link>
            <button type="button" onClick={() => dispatchAI("home", "仅根据当前已保存的信息，告诉我下一步可以做什么；不要补充或猜测缺失数据。") }><span>✦</span><div><strong>让 AI 判断下一步</strong><small>只使用已保存的真实上下文</small></div><b>↗</b></button>
          </div>
        </article>
      </section>
    </div>
  );
}
