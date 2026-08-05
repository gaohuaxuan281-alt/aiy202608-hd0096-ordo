"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthUser } from "../../components/AuthSession";
import {
  SUBJECTS,
  getGrade,
  getTextbookLabel,
} from "../../config/learning-catalog";
import type { DiagnosticQuizResult } from "../../lib/diagnostic-quiz-types";
import { formatExamDate, formatExamUnitRange, getDaysUntilExam } from "../../lib/exam-plan";
import type { LearningProfile } from "../../lib/learning-profile";
import type { StoredStudyPlan, StudyPlanTask } from "../../lib/study-plan-types";

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

function groupTasksByDate(tasks: StudyPlanTask[]) {
  const groups = new Map<string, StudyPlanTask[]>();
  for (const task of tasks) {
    const bucket = groups.get(task.date) ?? [];
    bucket.push(task);
    groups.set(task.date, bucket);
  }
  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

export function TimelinePage() {
  const user = useAuthUser();
  const [plans, setPlans] = useState<StoredStudyPlan[]>([]);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResponse["diagnostic"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedAIResultIds, setExpandedAIResultIds] = useState<Record<string, boolean>>({});

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

  function openTimelineAI() {
    window.dispatchEvent(new CustomEvent("zhixu:open-ai", {
      detail: {
        module: "timeline",
        prompt: "请帮我检查这些 Timeline 是否存在任务过载、科目失衡或缓冲不足的问题。",
      },
    }));
  }

  function toggleAIResult(planId: string) {
    setExpandedAIResultIds((current) => ({
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
          <p>这里展示所有历史 Timeline。最新生成的计划会排在最上面，Todo 始终从最新一条计划自动派生。</p>
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
          {plans.map((plan) => {
            const groupedTasks = groupTasksByDate(plan.plan.tasks);
            const aiExpanded = Boolean(expandedAIResultIds[plan.id]);
            return (
              <article key={plan.id} className="planner-card timeline-plan-card">
                <div className="planner-card-heading">
                  <div>
                    <small>时间轴计划</small>
                    <h2>{plan.plan.examName}</h2>
                  </div>
                  <span>更新于 {formatGeneratedAt(plan.plan.generatedAt)}</span>
                </div>

                <section className="plan-summary-grid timeline-plan-meta">
                  <article>
                    <span>考试日期</span>
                    <strong>{plan.plan.examDate}</strong>
                    <p>目标成绩：{plan.plan.targetScore || "未设置"}</p>
                  </article>
                  <article>
                    <span>计划摘要</span>
                    <strong>{plan.plan.summary}</strong>
                    <p>{plan.plan.explanation}</p>
                  </article>
                </section>

                <section className="timeline-board">
                  <div className="timeline-board-head">
                    <h3>时间轴任务</h3>
                    <span>{plan.plan.tasks.length} 个任务块</span>
                  </div>
                  {groupedTasks.map(([date, tasks]) => (
                    <section key={date} className="timeline-day-group">
                      <header>
                        <strong>{date}</strong>
                        <span>{tasks.reduce((sum, task) => sum + task.durationMinutes, 0)} 分钟</span>
                      </header>
                      <div className="timeline-task-list">
                        {tasks.map((task) => (
                          <article key={task.id} className={`timeline-task-card ${task.priority}`}>
                            <div className="timeline-task-time">
                              <strong>{task.startTime}</strong>
                              <span>{task.endTime}</span>
                            </div>
                            <div className="timeline-task-main">
                              <div className="timeline-task-topline">
                                <span>{task.subject}</span>
                                <b>{task.durationMinutes} 分钟</b>
                                <em>{task.status}</em>
                              </div>
                              <h4>{task.title}</h4>
                              <p>{task.goal}</p>
                              <small>完成标准：{task.completionCriteria}</small>
                              <small>安排原因：{task.reason}</small>
                              {task.knowledgePoints.length ? (
                                <div className="timeline-tag-row">
                                  {task.knowledgePoints.map((point) => <span key={point}>{point}</span>)}
                                </div>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </section>

                <section className="timeline-ai-result">
                  <div className="timeline-board-head">
                    <h3>AI 计划结果</h3>
                    <button
                      className="timeline-collapse-button"
                      type="button"
                      onClick={() => toggleAIResult(plan.id)}
                      aria-expanded={aiExpanded}
                    >
                      {aiExpanded ? "折叠" : "展开"}
                    </button>
                  </div>

                  {aiExpanded ? (
                    <div className="planner-result-body">
                      <section className="plan-chip-section">
                        <h3>AI 假设</h3>
                        <div className="plan-chip-list">
                          {(plan.plan.assumptions.length ? plan.plan.assumptions : ["当前没有额外假设。"]).map((item) => (
                            <span key={item} className="plan-chip">{item}</span>
                          ))}
                        </div>
                      </section>

                      <section className="plan-info-grid">
                        <article>
                          <h3>风险</h3>
                          <div className="plan-stacked-list">
                            {plan.plan.risks.length === 0 ? <p>当前未识别出高优先级风险。</p> : plan.plan.risks.map((risk) => (
                              <div key={risk.id} className="plan-list-item">
                                <strong>{risk.title}</strong>
                                <span>{risk.description}</span>
                                <small>{risk.level.toUpperCase()}</small>
                              </div>
                            ))}
                          </div>
                        </article>
                        <article>
                          <h3>待确认调整</h3>
                          <div className="plan-stacked-list">
                            {plan.plan.pendingAdjustments.length === 0 ? <p>当前没有待确认调整。</p> : plan.plan.pendingAdjustments.map((item) => (
                              <div key={item.id} className="plan-list-item">
                                <strong>{item.title}</strong>
                                <span>{item.description}</span>
                                <small>{item.impactLabel}</small>
                              </div>
                            ))}
                          </div>
                        </article>
                      </section>
                    </div>
                  ) : null}
                </section>
              </article>
            );
          })}
        </section>
      ) : null}
    </>
  );
}
