"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  JournalActionType,
  JournalActorType,
  JournalEntry,
  JournalModule,
  JournalSnapshot,
} from "./journal-types";

type DateFilter = "all" | "today" | "yesterday" | "week";
type SelectFilter<T extends string> = "all" | T;

const moduleOptions: { value: SelectFilter<JournalModule>; label: string }[] = [
  { value: "all", label: "全部模块" },
  { value: "todo", label: "Todo" },
  { value: "timeline", label: "Timeline" },
  { value: "ai-tutor", label: "AI Tutor" },
  { value: "summary", label: "反馈总结" },
  { value: "insights", label: "进展洞察" },
  { value: "profile", label: "用户中心" },
  { value: "auth", label: "账号安全" },
];

const actorOptions: { value: SelectFilter<JournalActorType>; label: string }[] = [
  { value: "all", label: "全部操作者" },
  { value: "user", label: "用户" },
  { value: "ai", label: "AI" },
  { value: "system", label: "系统" },
];

const actionGroups: { value: "all" | "task" | "plan" | "learning" | "account"; label: string }[] = [
  { value: "all", label: "全部操作" },
  { value: "task", label: "任务操作" },
  { value: "plan", label: "计划调整" },
  { value: "learning", label: "反馈与学习" },
  { value: "account", label: "账号操作" },
];

const taskActions = new Set<JournalActionType>([
  "task_created", "task_updated", "task_deleted", "task_started", "task_paused", "task_completed", "task_delayed",
]);
const planActions = new Set<JournalActionType>(["plan_adjusted", "adjustment_accepted", "adjustment_rejected", "correction_recorded"]);
const learningActions = new Set<JournalActionType>(["feedback_completed", "tutor_session_completed", "mastery_changed"]);
const accountActions = new Set<JournalActionType>([
  "membership_changed", "account_registered", "account_signed_in", "account_signed_out", "account_profile_updated", "account_security_changed", "learning_profile_updated",
]);

const journalTimeZone = "Asia/Shanghai";
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: journalTimeZone, month: "long", day: "numeric", weekday: "long" });
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: journalTimeZone, hour: "2-digit", minute: "2-digit", hour12: false });
const fullTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: journalTimeZone, year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

function dayNumber(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: journalTimeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Math.floor(Date.UTC(read("year"), read("month") - 1, read("day")) / 86_400_000);
}

function getDateLabel(iso: string) {
  const date = new Date(iso);
  const difference = dayNumber(new Date()) - dayNumber(date);
  if (difference === 0) return "今天";
  if (difference === 1) return "昨天";
  return dateFormatter.format(date);
}

function matchesDate(iso: string, filter: DateFilter) {
  if (filter === "all") return true;
  const difference = dayNumber(new Date()) - dayNumber(new Date(iso));
  if (filter === "today") return difference === 0;
  if (filter === "yesterday") return difference === 1;
  return difference >= 0 && difference < 7;
}

function matchesAction(action: JournalActionType, group: string) {
  if (group === "all") return true;
  if (group === "task") return taskActions.has(action);
  if (group === "plan") return planActions.has(action);
  if (group === "learning") return learningActions.has(action);
  return accountActions.has(action);
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function exportEntries(entries: JournalEntry[]) {
  const headers = ["时间", "操作者", "模块", "操作类型", "涉及对象", "标题", "修改原因", "可撤销"];
  const rows = entries.map((entry) => [
    fullTimeFormatter.format(new Date(entry.occurredAt)),
    entry.actorLabel,
    entry.moduleLabel,
    entry.actionLabel,
    entry.relatedObject.label,
    entry.title,
    entry.reason,
    entry.undoable ? "是" : "否",
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `知序操作日志-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function openJournalAI(prompt = "解释最近的操作记录，并指出值得关注的变化。") {
  window.dispatchEvent(new CustomEvent("zhixu:open-ai", { detail: { module: "journal", prompt } }));
}

function EntryDetail({ entry }: { entry: JournalEntry | null }) {
  if (!entry) {
    return <div className="journal-detail-empty"><span aria-hidden="true">▤</span><strong>选择一条日志</strong><p>在左侧打开记录后，这里会显示操作前后变化、原因和关联对象。</p></div>;
  }

  return (
    <div className="journal-detail-content">
      <header className="journal-detail-header">
        <div className={`journal-actor-mark ${entry.actorType}`} aria-hidden="true">{entry.actorType === "user" ? "我" : entry.actorType === "ai" ? "AI" : "系"}</div>
        <div><span>{entry.moduleLabel} · {entry.actionLabel}</span><h2>{entry.title}</h2><time>{fullTimeFormatter.format(new Date(entry.occurredAt))}</time></div>
      </header>

      <section className="journal-detail-section">
        <span className="journal-detail-kicker">操作摘要</span>
        <p>{entry.summary}</p>
      </section>

      <section className="journal-detail-section">
        <div className="journal-detail-title"><span className="journal-detail-kicker">详细变化</span><small>{entry.changes.length} 项</small></div>
        <div className="journal-change-table">
          {entry.changes.map((change) => (
            <div className="journal-change-item" key={`${entry.id}-${change.field}`}>
              <strong>{change.field}</strong>
              <div><span>{change.before ?? "未设置"}</span><b aria-hidden="true">→</b><em>{change.after ?? "已移除"}</em></div>
            </div>
          ))}
        </div>
      </section>

      <section className="journal-detail-section">
        <span className="journal-detail-kicker">修改原因</span>
        <p>{entry.reason}</p>
      </section>

      <dl className="journal-meta-grid">
        <div><dt>操作者</dt><dd>{entry.actorLabel}</dd></div>
        <div><dt>事件名称</dt><dd>{entry.eventName}</dd></div>
        <div><dt>涉及模块</dt><dd>{entry.moduleLabel}</dd></div>
        <div><dt>是否可撤销</dt><dd>{entry.undoable ? "可通过纠正记录撤销" : "不可直接撤销"}</dd></div>
      </dl>

      <div className="journal-detail-actions">
        <Link className="button primary" href={entry.relatedObject.href}>打开{entry.relatedObject.label} →</Link>
        {entry.undoable ? <button className="button" type="button" onClick={() => openJournalAI(`为日志“${entry.title}”生成一条纠正建议，但不要直接修改原记录。`)}>准备纠正记录</button> : null}
      </div>
      <p className="journal-immutable-note"><span aria-hidden="true">⌁</span> 历史日志不可编辑。纠正和撤销会作为一条新记录追加，并保留与原记录的关联。</p>
    </div>
  );
}

export function JournalPage({ snapshot }: { snapshot: JournalSnapshot }) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [moduleFilter, setModuleFilter] = useState<SelectFilter<JournalModule>>("all");
  const [actorFilter, setActorFilter] = useState<SelectFilter<JournalActorType>>("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(snapshot.entries[0]?.id ?? "");

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return snapshot.entries.filter((entry) => {
      const searchable = `${entry.title} ${entry.summary} ${entry.reason} ${entry.moduleLabel} ${entry.actionLabel} ${entry.relatedObject.label}`.toLocaleLowerCase("zh-CN");
      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        matchesDate(entry.occurredAt, dateFilter) &&
        (moduleFilter === "all" || entry.module === moduleFilter) &&
        (actorFilter === "all" || entry.actorType === actorFilter) &&
        matchesAction(entry.action, actionFilter)
      );
    });
  }, [actionFilter, actorFilter, dateFilter, moduleFilter, query, snapshot.entries]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, JournalEntry[]>();
    for (const entry of filteredEntries) {
      const label = getDateLabel(entry.occurredAt);
      const group = groups.get(label);
      if (group) group.push(entry);
      else groups.set(label, [entry]);
    }
    return Array.from(groups.entries());
  }, [filteredEntries]);

  const selectedEntry = snapshot.entries.find((entry) => entry.id === selectedId) ?? filteredEntries[0] ?? null;
  const todayEntries = snapshot.entries.filter((entry) => matchesDate(entry.occurredAt, "today"));
  const completedToday = todayEntries.filter((entry) => entry.action === "task_completed").length;
  const planChangesToday = todayEntries.filter((entry) => planActions.has(entry.action)).length;
  const systemEntriesToday = todayEntries.filter((entry) => entry.actorType === "system").length;
  const hasFilters = Boolean(query || dateFilter !== "all" || moduleFilter !== "all" || actorFilter !== "all" || actionFilter !== "all");

  function clearFilters() {
    setQuery("");
    setDateFilter("all");
    setModuleFilter("all");
    setActorFilter("all");
    setActionFilter("all");
  }

  return (
    <div className="journal-page">
      <header className="page-heading journal-heading">
        <div><p className="eyebrow">ACTIVITY LEDGER</p><h1>每一步，都有迹可循。</h1><p>自动记录任务、计划、答疑和账号的重要操作。这里展示事实，不修改其他模块的业务状态。</p></div>
        <div className="heading-actions"><button className="button" type="button" onClick={() => exportEntries(filteredEntries)}>⇩ 导出日志</button><button className="button primary" type="button" onClick={() => openJournalAI()}>✦ 解读日志</button></div>
      </header>

      <section className="journal-overview" aria-label="日志概览">
        <article><span>今天发生</span><strong>{todayEntries.length}</strong><small>条操作记录</small></article>
        <article><span>今日完成</span><strong>{completedToday}</strong><small>项学习任务</small></article>
        <article><span>计划变化</span><strong>{planChangesToday}</strong><small>项建议或确认</small></article>
        <article><span>系统操作</span><strong>{systemEntriesToday}</strong><small>条自动记录</small></article>
        <div className="journal-integrity"><span aria-hidden="true">✓</span><div><strong>追加式记录已启用</strong><small>历史记录不可直接修改</small></div></div>
      </section>

      <section className="journal-filter-panel" aria-label="筛选日志">
        <label className="journal-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、对象、原因或操作…" aria-label="搜索日志" />{query ? <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}>×</button> : null}</label>
        <label><span>日期</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)}><option value="all">全部日期</option><option value="today">今天</option><option value="yesterday">昨天</option><option value="week">最近 7 天</option></select></label>
        <label><span>模块</span><select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value as SelectFilter<JournalModule>)}>{moduleOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label><span>操作者</span><select value={actorFilter} onChange={(event) => setActorFilter(event.target.value as SelectFilter<JournalActorType>)}>{actorOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        {hasFilters ? <button className="journal-clear-filters" type="button" onClick={clearFilters}>清除筛选</button> : null}
      </section>

      <div className="journal-workspace">
        <section className="journal-list-panel" aria-label="操作日志列表">
          <header className="journal-list-header"><div><span>操作时间线</span><strong>{filteredEntries.length} 条记录</strong></div><div className="journal-action-tabs" role="group" aria-label="操作类型筛选">{actionGroups.map((item) => <button type="button" className={actionFilter === item.value ? "active" : ""} aria-pressed={actionFilter === item.value} key={item.value} onClick={() => setActionFilter(item.value)}>{item.label}</button>)}</div></header>

          {groupedEntries.length ? (
            <div className="journal-groups">
              {groupedEntries.map(([label, entries]) => (
                <section className="journal-day-group" key={label}>
                  <header><h2>{label}</h2><span>{entries.length} 条</span></header>
                  <div className="journal-entry-list">
                    {entries.map((entry) => (
                      <button className={`journal-entry${selectedEntry?.id === entry.id ? " selected" : ""}`} type="button" key={entry.id} onClick={() => setSelectedId(entry.id)} aria-pressed={selectedEntry?.id === entry.id}>
                        <time>{timeFormatter.format(new Date(entry.occurredAt))}</time>
                        <span className={`journal-entry-dot ${entry.actorType}`} aria-hidden="true" />
                        <div className="journal-entry-copy"><div><span>{entry.moduleLabel}</span><em>{entry.actionLabel}</em></div><strong>{entry.title}</strong><p>{entry.summary}</p><small>{entry.actorLabel} · {entry.relatedObject.label}</small></div>
                        <b aria-hidden="true">›</b>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="journal-empty-state"><span aria-hidden="true">⌕</span><h2>没有找到匹配记录</h2><p>换一个关键词或清除筛选条件后再试。</p><button className="button" type="button" onClick={clearFilters}>清除全部筛选</button></div>
          )}
        </section>

        <aside className="journal-detail-panel" aria-label="日志详情"><EntryDetail entry={selectedEntry} /></aside>
      </div>
    </div>
  );
}
