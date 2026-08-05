"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { StoredStudyPlan, StudyPlanGenerationInput } from "../../lib/study-plan-types";

type TimelinePlanResponse = {
  error?: string;
  plan?: StoredStudyPlan | null;
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

const DEFAULT_FORM: StudyPlanGenerationInput = {
  examName: "",
  examDate: "",
  targetScore: "",
  dailyAvailableMinutes: 0,
  preferredStartTime: "",
  unavailableWindows: "",
  fixedCommitments: "",
  mustKeepBoundaries: "",
  focusStrategy: "",
  extraContext: "",
};

function createInitialForm(): StudyPlanGenerationInput {
  return { ...DEFAULT_FORM };
}

export function TimelineCreatePage() {
  const router = useRouter();
  const user = useAuthUser();
  const [form, setForm] = useState<StudyPlanGenerationInput>(createInitialForm);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResponse["diagnostic"]>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadContext() {
      try {
        const [profileResponse, diagnosticResponse] = await Promise.all([
          fetch("/api/account/learning-profile", { cache: "no-store" }),
          fetch("/api/account/diagnostic-quiz", { cache: "no-store" }),
        ]);
        const profileResult = (await profileResponse.json()) as LearningProfileResponse;
        const diagnosticResult = (await diagnosticResponse.json()) as DiagnosticResponse;
        if (ignore) return;
        if (profileResponse.ok) setLearningProfile(profileResult.profile ?? null);
        if (diagnosticResponse.ok) setDiagnostic(diagnosticResult.diagnostic ?? null);
      } catch {
        if (!ignore) setError("网络连接异常，请稍后重试。");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadContext();
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

  async function generatePlan() {
    const confirmed = window.confirm("确认生成新的 Timeline 吗？生成后会新增到 Timeline 列表顶部，不会覆盖旧计划。");
    if (!confirmed) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/timeline/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as TimelinePlanResponse;
      if (!response.ok || !result.plan) {
        setError(result.error ?? "Timeline 生成失败，请稍后重试。");
        return;
      }
      router.push("/timeline");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">PLAN CREATION</p>
          <h1>创建 Timeline</h1>
          <p>填写这次考试与现实约束后，系统会调用 AI 生成一条新的 Timeline，并直接追加到计划列表顶部。</p>
        </div>
        <div className="heading-actions">
          <Link className="button" href="/timeline">返回 Timeline</Link>
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

      <section className="planner-card planner-form-shell">
        <div className="planner-card-heading">
          <div>
            <small>创建计划</small>
            <h2>考试与现实约束</h2>
          </div>
          <span>{loading ? "正在读取档案…" : "供 AI 排期使用"}</span>
        </div>

        <div className="planner-form">
          <label>
            <span>考试名称</span>
            <input
              value={form.examName}
              onChange={(event) => setForm((current) => ({ ...current, examName: event.target.value }))}
            />
          </label>
          <label>
            <span>考试日期</span>
            <input
              type="date"
              value={form.examDate}
              onChange={(event) => setForm((current) => ({ ...current, examDate: event.target.value }))}
            />
          </label>
          <label>
            <span>目标成绩</span>
            <input
              value={form.targetScore}
              onChange={(event) => setForm((current) => ({ ...current, targetScore: event.target.value }))}
            />
          </label>
          <label>
            <span>每天可用学习时间（分钟）</span>
            <input
              type="number"
              min={30}
              max={720}
              value={form.dailyAvailableMinutes || ""}
              onChange={(event) => setForm((current) => ({
                ...current,
                dailyAvailableMinutes: Number(event.target.value || 0),
              }))}
            />
          </label>
          <label>
            <span>通常从几点开始学习</span>
            <input
              type="time"
              value={form.preferredStartTime}
              onChange={(event) => setForm((current) => ({ ...current, preferredStartTime: event.target.value }))}
            />
          </label>
          <label className="planner-field-full">
            <span>不可用时间</span>
            <textarea
              rows={3}
              value={form.unavailableWindows}
              onChange={(event) => setForm((current) => ({ ...current, unavailableWindows: event.target.value }))}
            />
          </label>
          <label className="planner-field-full">
            <span>固定安排</span>
            <textarea
              rows={3}
              value={form.fixedCommitments}
              onChange={(event) => setForm((current) => ({ ...current, fixedCommitments: event.target.value }))}
            />
          </label>
          <label className="planner-field-full">
            <span>必须保留的边界</span>
            <textarea
              rows={3}
              value={form.mustKeepBoundaries}
              onChange={(event) => setForm((current) => ({ ...current, mustKeepBoundaries: event.target.value }))}
            />
          </label>
          <label className="planner-field-full">
            <span>当前重点与排序策略</span>
            <textarea
              rows={3}
              value={form.focusStrategy}
              onChange={(event) => setForm((current) => ({ ...current, focusStrategy: event.target.value }))}
            />
          </label>
          <label className="planner-field-full">
            <span>额外说明</span>
            <textarea
              rows={3}
              value={form.extraContext}
              onChange={(event) => setForm((current) => ({ ...current, extraContext: event.target.value }))}
            />
          </label>
        </div>

        <div className="timeline-create-actions">
          <button className="button primary" type="button" onClick={generatePlan} disabled={submitting}>
            {submitting ? "AI 生成中…" : "生成 Timeline"}
          </button>
        </div>
      </section>
    </>
  );
}
