"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../components/AuthSession";
import { formatExamDate } from "../../lib/exam-plan";
import type { InsightsSummary } from "../../lib/insights-store";

type InsightsResponse = {
  error?: string;
  summary?: InsightsSummary;
};

type ProgressTone = "primary" | "teal" | "amber" | "rose";

function ProgressBar({
  value,
  tone = "primary",
}: {
  value: number;
  tone?: ProgressTone;
}) {
  const toneClass = tone === "primary" ? "" : `tone-${tone}`;
  const boundedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={`insights-progress-track ${toneClass}`} aria-hidden="true">
      <div className="insights-progress-fill" style={{ width: `${boundedValue}%` }} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | ProgressTone;
}) {
  const toneClass = tone === "default" ? "" : `metric-${tone}`;

  return (
    <article className={`insights-metric-card ${toneClass}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </article>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="insights-section">
      <header>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="insights-section-body">{children}</div>
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="insights-empty-hint">{children}</p>;
}

type CollapsibleProps = {
  id: string;
  label: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

function Collapsible({
  id,
  label,
  badge,
  defaultOpen = false,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`insights-collapsible${open ? " open" : ""}`}>
      <button
        type="button"
        className="collapsible-trigger"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="collapsible-label">
          <span className="collapsible-mark" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          {label}
          {badge ? <span className="collapsible-badge">{badge}</span> : null}
        </span>
      </button>
      {open ? (
        <div id={`${id}-panel`} className="collapsible-panel">
          {children}
        </div>
      ) : null}
    </div>
  );
}

type SubjectCombined = {
  subject: string;
  subjectLabel: string;
  completion: {
    completed: number;
    total: number;
    percentage: number;
    completedPlannedLabel: string;
  } | null;
  mastery: {
    correct: number;
    total: number;
    percentage: number;
  } | null;
};

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildInsightsPrompt(summary: InsightsSummary | null) {
  if (!summary) {
    return "请说明进展洞察会如何解读我的学习数据，并告诉我接下来需要积累哪些数据。";
  }
  if (summary.planNeedsRefresh) {
    return "我的学习档案已经更新，但当前 Timeline 与新档案不一致。请根据当前诊断结果说明重新生成 Timeline 时最需要保留的重点。";
  }
  if (!summary.hasPlan) {
    return "我已经完成当前学习档案的诊断 Quiz，但还没有生成 Timeline。请根据现有薄弱点告诉我创建计划时最该优先安排什么。";
  }

  return [
    "请结合当前进展洞察解释我的学习状态，并指出最值得优先处理的一项风险。",
    `总体计划完成率：${summary.overallCompletion.percentage}%。`,
    `已完成 ${summary.taskStats.onTime} 项，延期 ${summary.taskStats.delayed} 项，取消 ${summary.taskStats.cancelled} 项。`,
    `最近 7 天提交 ${summary.feedback.lastSevenDays} 次反馈。`,
  ].join("\n");
}

function SubjectCombinedRow({ item }: { item: SubjectCombined }) {
  return (
    <div className="insights-subject-row">
      <span className="subject-glyph" aria-hidden="true">
        {item.subjectLabel[0]}
      </span>
      <div className="subject-info subject-info-combined">
        <div className="subject-head">
          <strong>{item.subjectLabel}</strong>
        </div>
        {item.completion ? (
          <div className="subject-metric">
            <small>
              计划完成 {item.completion.percentage}% · {item.completion.completed}/
              {item.completion.total} 项 · 已完成任务对应计划时长 {item.completion.completedPlannedLabel}
            </small>
            <ProgressBar
              value={item.completion.percentage}
              tone={
                item.completion.percentage >= 60
                  ? "primary"
                  : item.completion.percentage >= 30
                    ? "amber"
                    : "rose"
              }
            />
          </div>
        ) : (
          <div className="subject-metric">
            <small>计划完成率暂无数据</small>
          </div>
        )}
        {item.mastery ? (
          <div className="subject-metric">
            <small>
              掌握度 {item.mastery.correct}/{item.mastery.total} · {item.mastery.percentage}%
            </small>
            <ProgressBar
              value={item.mastery.percentage}
              tone={
                item.mastery.percentage >= 70
                  ? "teal"
                  : item.mastery.percentage >= 40
                    ? "amber"
                    : "rose"
              }
            />
          </div>
        ) : (
          <div className="subject-metric">
            <small>掌握度暂无数据</small>
          </div>
        )}
      </div>
    </div>
  );
}

export function InsightsPage() {
  const user = useAuthUser();
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/insights/summary", { cache: "no-store" });
        const result = (await response.json()) as InsightsResponse;
        if (ignore) return;

        if (!response.ok) {
          setSummary(null);
          setError(result.error ?? "暂时无法读取进展洞察。");
          return;
        }
        setSummary(result.summary ?? null);
      } catch {
        if (!ignore) {
          setSummary(null);
          setError("网络异常，请稍后重试。");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [reloadKey, user.id]);

  const subjectCombined = useMemo<SubjectCombined[]>(() => {
    if (!summary) return [];
    const combined = new Map<string, SubjectCombined>();

    for (const item of summary.subjectCompletion) {
      combined.set(item.subject, {
        subject: item.subject,
        subjectLabel: item.subjectLabel,
        completion: item.total > 0
          ? {
              completed: item.completed,
              total: item.total,
              percentage: item.percentage,
              completedPlannedLabel: item.completedPlannedLabel,
            }
          : null,
        mastery: null,
      });
    }

    for (const item of summary.subjectMastery) {
      const existing = combined.get(item.subject) ?? {
        subject: item.subject,
        subjectLabel: item.subjectLabel,
        completion: null,
        mastery: null,
      };
      existing.mastery = {
        correct: item.correct,
        total: item.total,
        percentage: item.percentage,
      };
      combined.set(item.subject, existing);
    }

    return Array.from(combined.values());
  }, [summary]);

  const generatedAtLabel = useMemo(
    () => (summary ? formatGeneratedAt(summary.generatedAt) : ""),
    [summary],
  );

  function openAI() {
    window.dispatchEvent(
      new CustomEvent("zhixu:open-ai", {
        detail: {
          module: "insights",
          prompt: buildInsightsPrompt(summary),
        },
      }),
    );
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">LEARNING SIGNALS</p>
          <h1>进展洞察</h1>
          <p>只读视图：观察掌握程度、执行情况与计划风险随时间的变化。</p>
        </div>
        <div className="heading-actions">
          <button className="button primary" type="button" onClick={openAI}>
            ✦ 调用 AI
          </button>
        </div>
      </header>

      {loading ? (
        <section className="insights-loading" aria-live="polite">
          <span className="spinner" aria-hidden="true">
            ◐
          </span>
          <p>正在汇总你的学习数据…</p>
        </section>
      ) : error ? (
        <section className="insights-error" role="alert">
          <p>{error}</p>
          <button type="button" className="button" onClick={() => setReloadKey((key) => key + 1)}>
            重新加载
          </button>
        </section>
      ) : !summary ? (
        <section className="insights-error">
          <p>暂时没有可以展示的进展数据。</p>
          <button type="button" className="button" onClick={() => setReloadKey((key) => key + 1)}>
            重新检查
          </button>
        </section>
      ) : (
        <div className="insights-frame">
          <SectionCard title="今日 / 近 7 天 / 当前计划进展" subtitle="不同时间窗口下的任务完成情况">
            <div className="insights-range-grid">
              <article>
                <small>今日</small>
                <strong>{summary.hasPlan ? `${summary.rangeProgress.today.percentage}%` : "暂无"}</strong>
                {summary.hasPlan ? <ProgressBar value={summary.rangeProgress.today.percentage} tone="primary" /> : null}
                <span>
                  {summary.hasPlan
                    ? `${summary.rangeProgress.today.completed} / ${summary.rangeProgress.today.total} 项`
                    : "尚未生成当前 Timeline"}
                </span>
              </article>
              <article>
                <small>近 7 天</small>
                <strong>{summary.hasPlan ? `${summary.rangeProgress.week.percentage}%` : "暂无"}</strong>
                {summary.hasPlan ? <ProgressBar value={summary.rangeProgress.week.percentage} tone="teal" /> : null}
                <span>
                  {summary.hasPlan
                    ? `${summary.rangeProgress.week.completed} / ${summary.rangeProgress.week.total} 项`
                    : "尚未生成当前 Timeline"}
                </span>
              </article>
              <article>
                <small>当前计划</small>
                <strong>{summary.hasPlan ? `${summary.rangeProgress.cycle.percentage}%` : "暂无"}</strong>
                {summary.hasPlan ? <ProgressBar value={summary.rangeProgress.cycle.percentage} tone="amber" /> : null}
                <span>
                  {summary.hasPlan
                    ? `${summary.rangeProgress.cycle.completed} / ${summary.rangeProgress.cycle.total} 项`
                    : "尚未生成当前 Timeline"}
                </span>
              </article>
            </div>
          </SectionCard>

          <section className={`insights-status-bar tone-${summary.preparationStatus.level}`}>
            <div className="status-bar-copy">
              <small>当前计划执行状态</small>
              <strong>{summary.preparationStatus.label}</strong>
            </div>
            <div className="status-bar-meta">
              {summary.exam.examName ? <span>{summary.exam.examName}</span> : null}
              {summary.exam.examDate ? <span>{formatExamDate(summary.exam.examDate)}</span> : null}
              {summary.exam.daysLeft !== null ? <span>剩余 {summary.exam.daysLeft} 天</span> : null}
            </div>
          </section>

          <div className="insights-metrics-grid">
            <MetricCard
              label="总体计划完成率"
              value={summary.hasPlan ? `${summary.overallCompletion.percentage}%` : "暂无"}
              hint={summary.hasPlan
                ? `已完成 ${summary.overallCompletion.completed} / ${summary.overallCompletion.total} 项任务`
                : "尚未生成当前 Timeline"}
              tone={
                summary.overallCompletion.percentage >= 60
                  ? "primary"
                  : summary.overallCompletion.percentage >= 30
                    ? "amber"
                    : "rose"
              }
            />
            <MetricCard
              label="任务状态"
              value={summary.hasPlan ? `${summary.taskStats.onTime} 项已完成` : "暂无计划"}
              hint={summary.hasPlan
                ? `延期 ${summary.taskStats.delayed} · 取消 ${summary.taskStats.cancelled}`
                : "生成 Timeline 后自动汇总"}
              tone={summary.overallCompletion.percentage >= 60 ? "primary" : "amber"}
            />
            <MetricCard
              label="当前计划已记录实际投入"
              value={summary.hasPlan ? summary.overallCompletion.actualLabel : "暂无"}
              hint={summary.overallCompletion.actualRangeLabel
                ? `${summary.overallCompletion.actualRangeLabel} · ${summary.overallCompletion.recordedActualDays} 天填写了实际时长`
                : summary.hasPlan
                  ? "当前计划尚未开始或暂无实际时长记录"
                  : "尚未生成当前 Timeline"}
              tone="teal"
            />
            <MetricCard
              label="AI Tutor 使用"
              value={`${summary.aiTutor.conversations} 段对话`}
              hint={
                summary.aiTutor.lastUsedAtLabel
                  ? `最近 ${summary.aiTutor.lastUsedAtLabel} · 共 ${summary.aiTutor.messages} 条消息`
                  : "尚未使用"
              }
            />
            <MetricCard
              label="每日反馈"
              value={`${summary.feedback.lastSevenDays} / 7`}
              hint={`累计 ${summary.feedback.total} 条反馈 · 近 7 天`}
              tone={summary.feedback.lastSevenDays >= 5 ? "primary" : "default"}
            />
          </div>

          <SectionCard
            title="各科计划完成率与掌握程度"
            subtitle="按学科展示任务完成情况、已完成任务对应的计划时长与诊断 Quiz 掌握度"
          >
            {subjectCombined.length === 0 ? (
              <EmptyHint>尚无学习计划任务或诊断 Quiz 数据。</EmptyHint>
            ) : subjectCombined.length > 2 ? (
              <Collapsible
                id="subjects-combined"
                label={`${subjectCombined.length} 个科目`}
                badge={`${subjectCombined.length}`}
              >
                <ul className="insights-subject-list">
                  {subjectCombined.map((item) => (
                    <li key={item.subject} className="subject-combined-row">
                      <SubjectCombinedRow item={item} />
                    </li>
                  ))}
                </ul>
              </Collapsible>
            ) : (
              <ul className="insights-subject-list">
                {subjectCombined.map((item) => (
                  <li key={item.subject} className="subject-combined-row">
                    <SubjectCombinedRow item={item} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="薄弱知识点与进步科目" subtitle="来自当前学习档案诊断 Quiz 的薄弱点与最近两次同范围测验对比">
            {summary.weakTopics.length === 0 && summary.improvingSubjects.length === 0 ? (
              <EmptyHint>暂无明显薄弱点；至少完成两次诊断 Quiz 后才能对比进步情况。</EmptyHint>
            ) : (
              <Collapsible
                id="weak-and-improving"
                label={`薄弱 ${summary.weakTopics.length} · 进步 ${summary.improvingSubjects.length}`}
                badge={`${summary.weakTopics.length + summary.improvingSubjects.length}`}
              >
                <div className="weak-improving-group">
                  <div className="weak-improving-subgroup">
                    <h3>薄弱知识点</h3>
                    {summary.weakTopics.length === 0 ? (
                      <p className="insights-empty-hint">暂未发现明显薄弱点，继续保持。</p>
                    ) : (
                      <ul className="insights-chip-list">
                        {summary.weakTopics.map((topic) => (
                          <li key={`${topic.subject}-${topic.unitNumber}-${topic.knowledgePoint}`}>
                            <span className="insights-chip tone-rose">
                              <strong>{topic.subjectLabel}</strong>
                              <span>{topic.unitLabel}</span>
                              <em>{topic.knowledgePoint}</em>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="weak-improving-subgroup">
                    <h3>进步最快的科目</h3>
                    {summary.improvingSubjects.length === 0 ? (
                      <p className="insights-empty-hint">需要至少完成两次诊断 Quiz 才能对比进步情况。</p>
                    ) : (
                      <ul className="insights-subject-list">
                        {summary.improvingSubjects.map((item) => (
                          <li key={item.subject}>
                            <div className="insights-subject-row">
                              <span className="subject-glyph" aria-hidden="true">
                                {item.subjectLabel[0]}
                              </span>
                              <div className="subject-info">
                                <div className="subject-head">
                                  <strong>{item.subjectLabel}</strong>
                                  <span className="delta-up">+{item.delta}%</span>
                                </div>
                                <small>
                                  从 {item.beforePercentage}% 提升到 {item.afterPercentage}%
                                </small>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Collapsible>
            )}
          </SectionCard>

          <SectionCard
            title="当前计划与执行记录"
            subtitle="实际投入仅统计当前计划日期范围内每日反馈中填写的时长"
          >
            {summary.overallCompletion.total === 0 ? (
              <EmptyHint>尚无计划任务可对比。</EmptyHint>
            ) : (
              <div className="insights-diff">
                <div className="diff-row">
                  <span>当前计划总时长</span>
                  <strong>{summary.overallCompletion.plannedLabel}</strong>
                </div>
                <div className="diff-row">
                  <span>当前计划已记录实际投入</span>
                  <strong>{summary.overallCompletion.actualLabel}</strong>
                </div>
                <div className="diff-row">
                  <span>实际投入记录覆盖</span>
                  <strong>{summary.overallCompletion.recordedActualDays} 天反馈</strong>
                </div>
                <div className="diff-row">
                  <span>任务完成进度</span>
                  <strong>{summary.overallCompletion.percentage}%</strong>
                </div>
                <ProgressBar
                  value={summary.overallCompletion.percentage}
                  tone={summary.overallCompletion.percentage >= 60 ? "primary" : "amber"}
                />
              </div>
            )}
          </SectionCard>

          <p className="insights-footnote">
            数据生成于 {generatedAtLabel}（北京时间）· 实际投入仅统计当前计划日期范围内每日反馈中的已填写记录 · 本页只读，不修改任何计划。
          </p>
        </div>
      )}
    </>
  );
}
