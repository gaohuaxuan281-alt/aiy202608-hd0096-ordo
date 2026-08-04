"use client";

import { useState } from "react";
import {
  GRADE_GROUPS,
  SUBJECTS,
  getGrade,
  getSubjectsForGrade,
  getTextbooksForSubject,
  type GradeCode,
  type SubjectCode,
} from "../../config/learning-catalog";
import type { LearningProfile } from "../../lib/learning-profile";

type QuestionnaireStep = 1 | 2 | 3;

type LearningQuestionnaireProps = {
  initialProfile: LearningProfile | null;
  variant?: "gate" | "embedded";
  phone?: string;
  onComplete?: (profile: LearningProfile) => void;
  onCancel?: () => void;
};

type ApiResult = {
  error?: string;
  profile?: LearningProfile;
};

const STEP_COPY = [
  { eyebrow: "STEP 01 · GRADE", title: "你现在读几年级？", description: "年级决定可选科目和教材范围，也会影响任务难度。" },
  { eyebrow: "STEP 02 · SUBJECTS", title: "这次想规划哪些科目？", description: "可以多选。知序会优先围绕这些科目安排学习任务。" },
  { eyebrow: "STEP 03 · TEXTBOOKS", title: "你正在使用哪套教材？", description: "按科目选择常用教材版本，之后可以在用户中心修改。" },
] as const;

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)} ···· ${phone.slice(-4)}`;
}

export function LearningQuestionnaire({
  initialProfile,
  variant = "gate",
  phone,
  onComplete,
  onCancel,
}: LearningQuestionnaireProps) {
  const [step, setStep] = useState<QuestionnaireStep>(1);
  const [grade, setGrade] = useState<GradeCode | null>(initialProfile?.grade ?? null);
  const [subjects, setSubjects] = useState<SubjectCode[]>(
    initialProfile?.subjects.map((item) => item.subject) ?? [],
  );
  const [textbooks, setTextbooks] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialProfile?.subjects.map((item) => [item.subject, item.textbook]) ?? [],
    ),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const availableSubjects = grade ? getSubjectsForGrade(grade) : [];
  const orderedSubjects = availableSubjects.filter((subject) => subjects.includes(subject));
  const copy = STEP_COPY[step - 1];

  function chooseGrade(nextGrade: GradeCode) {
    if (nextGrade !== grade) {
      setSubjects([]);
      setTextbooks({});
    }
    setGrade(nextGrade);
    setError("");
  }

  function toggleSubject(subject: SubjectCode) {
    setSubjects((current) => {
      if (current.includes(subject)) {
        setTextbooks((items) => {
          const next = { ...items };
          delete next[subject];
          return next;
        });
        return current.filter((item) => item !== subject);
      }
      return [...current, subject];
    });
    setError("");
  }

  function goNext() {
    setError("");
    if (step === 1) {
      if (!grade) {
        setError("请先选择你目前所在的年级。");
        return;
      }
      setStep(2);
      return;
    }
    if (subjects.length === 0) {
      setError("请至少选择一个学习科目。");
      return;
    }
    setStep(3);
  }

  function goBack() {
    setError("");
    setStep((current) => Math.max(1, current - 1) as QuestionnaireStep);
  }

  async function submit() {
    if (!grade) return;
    const missingSubject = orderedSubjects.find((subject) => !textbooks[subject]);
    if (missingSubject) {
      setError(`请为${SUBJECTS[missingSubject].label}选择教材版本。`);
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/account/learning-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade,
          subjects: orderedSubjects.map((subject) => ({
            subject,
            textbook: textbooks[subject],
          })),
        }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.profile) {
        setError(result.error ?? "学习档案暂时没有保存，请重试。");
        return;
      }

      if (onComplete) {
        onComplete(result.profile);
      } else {
        window.location.replace("/");
      }
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/");
    }
  }

  const questionnaire = (
    <section className={`learning-questionnaire ${variant}`} aria-labelledby="learning-questionnaire-title">
      <div className="questionnaire-progress" aria-label={`学习档案设置，第 ${step} 步，共 3 步`}>
        {[1, 2, 3].map((item) => (
          <div key={item} className={item <= step ? "active" : ""} aria-current={item === step ? "step" : undefined}>
            <span>{item < step ? "✓" : item}</span>
            <i />
          </div>
        ))}
      </div>

      <header className="questionnaire-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="learning-questionnaire-title">{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      {error ? <div className="auth-message error questionnaire-error" role="alert"><span>!</span>{error}</div> : null}

      <div className="questionnaire-body">
        {step === 1 ? (
          <div className="grade-groups">
            {GRADE_GROUPS.map((group) => (
              <fieldset key={group.label}>
                <legend>{group.label}</legend>
                <div className="grade-options">
                  {group.gradeIds.map((gradeId) => {
                    const option = getGrade(gradeId);
                    return (
                      <button key={gradeId} type="button" className={grade === gradeId ? "selected" : ""} onClick={() => chooseGrade(gradeId)} aria-pressed={grade === gradeId}>
                        <strong>{option.shortLabel}</strong><span>{option.label}</span><i>{grade === gradeId ? "✓" : ""}</i>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        ) : null}

        {step === 2 && grade ? (
          <div>
            <div className="questionnaire-selection-note"><span>{getGrade(grade).label}</span><strong>已选择 {subjects.length} 科</strong></div>
            <div className="subject-options">
              {availableSubjects.map((subject) => {
                const selected = subjects.includes(subject);
                return (
                  <button key={subject} type="button" className={selected ? "selected" : ""} onClick={() => toggleSubject(subject)} aria-pressed={selected}>
                    <span aria-hidden="true">{SUBJECTS[subject].glyph}</span><strong>{SUBJECTS[subject].label}</strong><i>{selected ? "✓" : "+"}</i>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 3 && grade ? (
          <div className="textbook-options">
            {orderedSubjects.map((subject, index) => (
              <label key={subject} className="textbook-row">
                <span className="textbook-subject"><i aria-hidden="true">{SUBJECTS[subject].glyph}</i><span><small>科目 {String(index + 1).padStart(2, "0")}</small><strong>{SUBJECTS[subject].label}</strong></span></span>
                <select value={textbooks[subject] ?? ""} onChange={(event) => setTextbooks((current) => ({ ...current, [subject]: event.target.value }))} aria-label={`${SUBJECTS[subject].label}教材版本`}>
                  <option value="">请选择教材版本</option>
                  {getTextbooksForSubject(grade, subject).map((textbook) => <option key={textbook.id} value={textbook.id}>{textbook.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <footer className="questionnaire-actions">
        {step > 1 ? <button className="button" type="button" onClick={goBack} disabled={submitting}>上一步</button> : variant === "embedded" && onCancel ? <button className="button" type="button" onClick={onCancel}>取消</button> : <span />}
        {step < 3 ? <button className="button primary" type="button" onClick={goNext}>继续 <span aria-hidden="true">→</span></button> : <button className="button primary" type="button" onClick={submit} disabled={submitting}>{submitting ? "正在保存…" : variant === "gate" ? "完成并进入知序" : "保存学习档案"}</button>}
      </footer>
    </section>
  );

  if (variant === "embedded") return questionnaire;

  return (
    <main className="onboarding-page">
      <div className="onboarding-shell">
        <aside className="onboarding-story">
          <div className="auth-brand"><span className="auth-brand-mark" aria-hidden="true">序</span><span>知序</span><small>STUDY FLOW</small></div>
          <div className="onboarding-story-copy">
            <p>首次使用 · 约 1 分钟</p>
            <h2>先认识你，<br />再安排每一天。</h2>
            <span>不同年级、科目和教材，需要不同的复习节奏。你的选择将成为后续计划生成与动态调整的基础。</span>
          </div>
          <div className="onboarding-account">
            <span><i />当前账号</span>
            <strong>{phone ? maskPhone(phone) : "已登录"}</strong>
            <button type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? "正在退出…" : "切换账号"}</button>
          </div>
        </aside>
        <div className="onboarding-form-side">{questionnaire}</div>
      </div>
    </main>
  );
}
