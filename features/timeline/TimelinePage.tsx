"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthUser } from "../../components/AuthSession";
import {
  SUBJECTS,
  getGrade,
  getTextbookLabel,
} from "../../config/learning-catalog";
import type { DiagnosticQuizResult } from "../../lib/diagnostic-quiz-types";
import { formatExamDate, formatExamUnitRange, getDaysUntilExam } from "../../lib/exam-plan";
import type { LearningProfile } from "../../lib/learning-profile";
import type { StoredStudyPlan, StudyPlanTask } from "../../lib/study-plan/types";

type TimelinePlanResponse = {
  error?: string;
  plan?: StoredStudyPlan | null;
  plans?: StoredStudyPlan[];
};

type LearningProfileResponse = {
  error?: string;
  profile?: LearningProfile | null;
};

type DiagnosticResponse = {
  error?: string;
  diagnostic?: Pick<
    DiagnosticQuizResult,
    "attemptId" | "score" | "total" | "percentage" | "coverageSummary" | "subjectScores" | "weakTopics" | "completedAt"
  > | null;
};

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

type TimelineTaskEntry = {
  key: string;
  planId: string;
  examName: string;
  generatedAt: string;
  task: StudyPlanTask;
};

export function TimelinePage() {
  const user = useAuthUser();
  const [plans, setPlans] = useState<StoredStudyPlan[]>([]);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResponse["diagnostic"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [expandedPlanSummaryIds, setExpandedPlanSummaryIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let ignore = false;

    async function loadPlans() {
      try {
        const [timelineResponse, profileResponse, diagnosticResponse] = await Promise.all([
          fetch("/api/timeline/plan", { cache: "no-store" }),
          fetch("/api/account/learning-profile", { cache: "no-store" }),
          fetch("/api/account/diagnostic-quiz", { cache: "no-store" }),
        ]);
        const result = (await timelineResponse.json()) as TimelinePlanResponse;
        const profileResult = (await profileResponse.json()) as LearningProfileResponse;
        const diagnosticResult = (await diagnosticResponse.json()) as DiagnosticResponse;
        if (ignore) return;
        if (!timelineResponse.ok) {
          setError(result.error ?? "暂时无法读取 Timeline。");
        } else {
          setPlans(result.plans ?? []);
        }
        if (profileResponse.ok && profileResult.profile) {
          setLearningProfile(profileResult.profile);
        }
        if (diagnosticResponse.ok) setDiagnostic(diagnosticResult.diagnostic ?? null);
      } catch {
        if (!ignore) setError("网络连接异常，请稍后重试。");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadPlans();
    return () => {
      ignore = true;
    };
  }, []);

  const profileSummary = learningProfile
    ? `${getGrade(learningProfile.grade).label} · ${learningProfile.subjects
      .map((item) => `${SUBJECTS[item.subject].label}（${getTextbookLabel(learningProfile.grade, item.subject, item.textbook)}）`)
      .join("、")}`
    : "";
  const examScopeSummary = learningProfile
    ? learningProfile.subjects
      .map((item) => `${SUBJECTS[item.subject].label} ${formatExamUnitRange(item.subject, item.examUnitStart, item.examUnitEnd)}`)
      .join("；")
    : "";
  const weakTopicSummary = diagnostic?.weakTopics?.length
    ? diagnostic.weakTopics.slice(0, 6).map((item) => `${item.subjectLabel}${item.unitLabel}·${item.knowledgePoint}`).join("；")
    : "暂无已识别薄弱知识点";
  const timelineEntries = useMemo<TimelineTaskEntry[]>(
    () => plans
      .flatMap((plan) => plan.plan.tasks.map((task) => ({
        key: `${plan.id}:${task.id}`,
        planId: plan.id,
        examName: plan.plan.examName,
        generatedAt: plan.plan.generatedAt,
        task,
      })))
      .sort((left, right) => {
        const leftKey = `${left.task.date} ${left.task.startTime}`;
        const rightKey = `${right.task.date} ${right.task.startTime}`;
        return leftKey.localeCompare(rightKey);
      }),
    [plans],
  );
  const groupedTimelineEntries = useMemo(() => {
    const groups = new Map<string, TimelineTaskEntry[]>();
    for (const entry of timelineEntries) {
      const bucket = groups.get(entry.task.date) ?? [];
      bucket.push(entry);
      groups.set(entry.task.date, bucket);
    }
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [timelineEntries]);

  function openTimelineAI() {
    window.dispatchEvent(new CustomEvent("zhixu:open-ai", {
      detail: {
        module: "timeline",
        prompt: "请帮我检查这些 Timeline 是否存在任务过载、科目失衡或缓冲不足的问题。",
      },
    }));
  }

  function toggleTask(taskKey: string) {
    setExpandedTaskIds((current) => ({
      ...current,
      [taskKey]: !current[taskKey],
    }));
  }

  function togglePlanSummary(planId: string) {
    setExpandedPlanSummaryIds((current) => ({
      ...current,
      [planId]: !current[planId],
    }));
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">PLAN &amp; SCHEDULE</p>
          <h1>Timeline</h1>
          <p>这里把计划拆成优先 10–20 分钟、最多 30 分钟的可执行微任务；展开任务即可按步骤完成并对照标准验收。</p>
        </div>
        <div className="heading-actions">
          <button className="button" type="button" onClick={openTimelineAI}>✦ 检查计划风险</button>
          <Link className="button primary timeline-add-button" href="/timeline/new" aria-label="创建新的 Timeline">+</Link>
        </div>
      </header>

      {error ? <div className="planner-error" role="alert">{error}</div> : null}

      {learningProfile ? (
        <section className="planner-card planner-brief-card">
          <div className="planner-card-heading">
            <div>
              <small>个性化输入来源</small>
              <h2>{user?.phone ? `账号 ${user.phone}` : "当前学习档案"}</h2>
            </div>
            <span>{learningProfile.examDate ? `考试还有 ${getDaysUntilExam(learningProfile.examDate)} 天` : "待补充考试日期"}</span>
          </div>
          <div className="plan-summary-grid">
            <article>
              <span>学习档案</span>
              <strong>{profileSummary}</strong>
              <p>{learningProfile.examDate ? `计划考试：${formatExamDate(learningProfile.examDate)}` : "尚未设置考试日期"}</p>
            </article>
            <article>
              <span>考试范围</span>
              <strong>{examScopeSummary || "尚未设置"}</strong>
              <p>AI 会优先在这些 Unit 内安排 Timeline 任务。</p>
            </article>
            <article>
              <span>诊断结果</span>
              <strong>{diagnostic ? `${diagnostic.score}/${diagnostic.total}（正确率 ${diagnostic.percentage}%）` : "尚未完成诊断 Quiz"}</strong>
              <p>{weakTopicSummary}</p>
            </article>
          </div>
        </section>
      ) : null}

      {loading ? <section className="planner-card planner-empty">正在读取 Timeline…</section> : null}

      {!loading && plans.length === 0 ? (
        <section className="planner-card planner-empty">
          <strong>还没有 Timeline</strong>
          <p>点击右上角的 `+` 进入创建页面，确认后会生成一条新的 Timeline，并直接追加到列表顶部。</p>
        </section>
      ) : null}

      {plans.length > 0 ? (
        <section className="timeline-plan-stack">
          <article className="planner-card timeline-plan-card">
            <div className="planner-card-heading">
              <div>
                <small>总时间轴</small>
                <h2>全部任务</h2>
              </div>
              <span>{timelineEntries.length} 个任务块</span>
            </div>

            <section className="timeline-board">
              <div className="timeline-board-head">
                <h3>时间轴任务</h3>
                <span>按时间顺序排列</span>
              </div>
              {groupedTimelineEntries.map(([date, entries]) => (
                <section key={date} className="timeline-day-group">
                  <header>
                    <strong>{date}</strong>
                    <span>{entries.reduce((sum, entry) => sum + entry.task.durationMinutes, 0)} 分钟</span>
                  </header>
                  <div className="timeline-task-list">
                    {entries.map((entry) => {
                      const expanded = Boolean(expandedTaskIds[entry.key]);
                      return (
                        <article key={entry.key} className={`timeline-task-card ${entry.task.priority} ${expanded ? "is-expanded" : ""}`}>
                          <div className="timeline-task-time">
                            <strong>{entry.task.startTime}</strong>
                            <span>{entry.task.endTime}</span>
                          </div>
                          <div className="timeline-task-main">
                            <div className="timeline-task-topline">
                              <span>{entry.task.subject}</span>
                              <b>{entry.task.durationMinutes} 分钟</b>
                              <em>{entry.examName}</em>
                            </div>
                            <div className="timeline-task-header">
                              <h4>{entry.task.title}</h4>
                              <button
                                className="timeline-collapse-button"
                                type="button"
                                onClick={() => toggleTask(entry.key)}
                                aria-expanded={expanded}
                              >
                                {expanded ? "折叠" : "展开"}
                              </button>
                            </div>
                            {expanded ? (
                              <>
                                <p><strong>执行步骤：</strong>{entry.task.goal}</p>
                                <small>验收标准：{entry.task.completionCriteria}</small>
                                <small>安排原因：{entry.task.reason}</small>
                                <small>来源计划：{entry.examName} · {formatGeneratedAt(entry.generatedAt)}</small>
                                {entry.task.knowledgePoints.length ? (
                                  <div className="timeline-tag-row">
                                    {entry.task.knowledgePoints.map((point) => <span key={point}>{point}</span>)}
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </section>
          </article>

          <article className="planner-card timeline-plan-card">
            <div className="planner-card-heading">
              <div>
                <small>AI 计划结果</small>
                <h2>日期与摘要</h2>
              </div>
              <span>{plans.length} 条 Timeline</span>
            </div>

            <div className="timeline-summary-list">
              {plans.map((plan) => {
                const expanded = Boolean(expandedPlanSummaryIds[plan.id]);
                return (
                  <section key={plan.id} className="timeline-summary-item">
                    <div className="timeline-summary-head">
                      <div>
                        <small>{plan.plan.examDate}</small>
                        <strong>{plan.plan.examName}</strong>
                      </div>
                      <button
                        className="timeline-collapse-button"
                        type="button"
                        onClick={() => togglePlanSummary(plan.id)}
                        aria-expanded={expanded}
                      >
                        {expanded ? "折叠" : "展开"}
                      </button>
                    </div>
                    {expanded ? (
                      <div className="timeline-summary-body">
                        <p>{plan.plan.summary}</p>
                        <small>{plan.plan.explanation}</small>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </article>
        </section>
      ) : null}
    </>
  );
}
