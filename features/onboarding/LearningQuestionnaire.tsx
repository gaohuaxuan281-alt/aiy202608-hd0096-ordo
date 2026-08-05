"use client";

import { useState } from "react";
import {
  GRADE_GROUPS,
  SUBJECTS,
  getGrade,
  getSubjectsForGrade,
  getTextbookLabel,
  getTextbooksForSubject,
  type GradeCode,
  type SubjectCode,
} from "../../config/learning-catalog";
import {
  MAX_EXAM_UNIT,
  formatExamDate,
  formatExamUnitRange,
  getDateAfterDays,
  getDaysUntilExam,
  isValidExamDate,
  isValidUnitRange,
} from "../../lib/exam-plan";
import type {
  DiagnosticQuiz,
  DiagnosticQuizResult,
} from "../../lib/diagnostic-quiz-types";
import type { LearningProfile } from "../../lib/learning-profile";
import { DiagnosticQuizStep } from "./DiagnosticQuizStep";

type QuestionnaireStep = 1 | 2 | 3 | 4 | 5 | 6;
type UnitRangeDraft = { start: string; end: string };

type LearningQuestionnaireProps = {
  initialProfile: LearningProfile | null;
  variant?: "gate" | "embedded";
  phone?: string;
  onComplete?: (profile: LearningProfile, result: DiagnosticQuizResult) => void;
  onCancel?: () => void;
};

type ApiResult = {
  error?: string;
  profile?: LearningProfile;
  quiz?: DiagnosticQuiz;
  result?: DiagnosticQuizResult;
};

const STEP_COPY = [
  { eyebrow: "STEP 01 · GRADE", title: "你现在读几年级？", description: "年级决定可选科目和教材范围，也会影响任务难度。" },
  { eyebrow: "STEP 02 · SUBJECTS", title: "这次想规划哪些科目？", description: "可以多选。知序会优先围绕这些科目安排学习任务。" },
  { eyebrow: "STEP 03 · TEXTBOOKS", title: "你正在使用哪套教材？", description: "按科目选择中国常用教材版本，后续计划会以此为准。" },
  { eyebrow: "STEP 04 · EXAM DATE", title: "计划什么时候考试？", description: "可以选择下周、两周后，或直接指定考试日期。" },
  { eyebrow: "STEP 05 · EXAM SCOPE", title: "这次考试考哪些 Unit？", description: "按每科教材选择起止 Unit/单元，例如 Unit 1–3。" },
  { eyebrow: "STEP 06 · DIAGNOSTIC QUIZ", title: "用 10 题找到真正的复习重点", description: "题目会尽量覆盖所选 Unit 的核心知识点，结果将直接提供给 Timeline 和 AI。" },
] as const;

const EXAM_DATE_PRESETS = [
  { label: "下周考试", days: 7, hint: "7 天后" },
  { label: "两周后考试", days: 14, hint: "14 天后" },
  { label: "一个月后", days: 30, hint: "30 天后" },
] as const;

const UNIT_OPTIONS = Array.from({ length: MAX_EXAM_UNIT }, (_, index) => index + 1);

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)} ···· ${phone.slice(-4)}`;
}

function unitOptionLabel(subject: SubjectCode, unit: number) {
  return subject === "english" ? `Unit ${unit}` : `第 ${unit} 单元`;
}

export function LearningQuestionnaire({
  initialProfile,
  variant = "gate",
  phone,
  onComplete,
  onCancel,
}: LearningQuestionnaireProps) {
  const [step, setStep] = useState<QuestionnaireStep>(() =>
    variant === "gate" &&
    initialProfile?.examDate &&
    isValidExamDate(initialProfile.examDate) &&
    initialProfile.subjects.every((item) => isValidUnitRange(item.examUnitStart, item.examUnitEnd))
      ? 5
      : 1,
  );
  const [grade, setGrade] = useState<GradeCode | null>(initialProfile?.grade ?? null);
  const [subjects, setSubjects] = useState<SubjectCode[]>(
    initialProfile?.subjects.map((item) => item.subject) ?? [],
  );
  const [textbooks, setTextbooks] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialProfile?.subjects.map((item) => [item.subject, item.textbook]) ?? [],
    ),
  );
  const [examDate, setExamDate] = useState(initialProfile?.examDate ?? "");
  const [unitRanges, setUnitRanges] = useState<Record<string, UnitRangeDraft>>(() =>
    Object.fromEntries(
      initialProfile?.subjects.flatMap((item) =>
        isValidUnitRange(item.examUnitStart, item.examUnitEnd)
          ? [[item.subject, { start: String(item.examUnitStart), end: String(item.examUnitEnd) }]]
          : [],
      ) ?? [],
    ),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [quiz, setQuiz] = useState<DiagnosticQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<DiagnosticQuizResult | null>(null);
  const [completedProfile, setCompletedProfile] = useState<LearningProfile | null>(null);

  const availableSubjects = grade ? getSubjectsForGrade(grade) : [];
  const orderedSubjects = availableSubjects.filter((subject) => subjects.includes(subject));
  const copy = STEP_COPY[step - 1];
  const daysUntilExam = examDate && isValidExamDate(examDate) ? getDaysUntilExam(examDate) : null;

  function resetQuiz() {
    setQuiz(null);
    setAnswers({});
    setQuizResult(null);
    setCompletedProfile(null);
  }

  function buildProfilePayload() {
    if (!grade) return null;
    return {
      grade,
      examDate,
      subjects: orderedSubjects.map((subject) => ({
        subject,
        textbook: textbooks[subject],
        examUnitStart: Number(unitRanges[subject]?.start),
        examUnitEnd: Number(unitRanges[subject]?.end),
      })),
    };
  }

  function chooseGrade(nextGrade: GradeCode) {
    if (nextGrade !== grade) {
      setSubjects([]);
      setTextbooks({});
      setUnitRanges({});
      resetQuiz();
    }
    setGrade(nextGrade);
    setError("");
  }

  function toggleSubject(subject: SubjectCode) {
    resetQuiz();
    setSubjects((current) => {
      if (current.includes(subject)) {
        setTextbooks((items) => {
          const next = { ...items };
          delete next[subject];
          return next;
        });
        setUnitRanges((items) => {
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

  function chooseTextbook(subject: SubjectCode, textbook: string) {
    resetQuiz();
    setTextbooks((current) => ({ ...current, [subject]: textbook }));
    setUnitRanges((current) => {
      const next = { ...current };
      delete next[subject];
      return next;
    });
    setError("");
  }

  function setUnitBoundary(subject: SubjectCode, boundary: keyof UnitRangeDraft, value: string) {
    resetQuiz();
    setUnitRanges((current) => {
      const nextRange = { ...(current[subject] ?? { start: "", end: "" }), [boundary]: value };
      if (
        boundary === "start" &&
        nextRange.start &&
        nextRange.end &&
        Number(nextRange.start) > Number(nextRange.end)
      ) {
        nextRange.end = nextRange.start;
      }
      return { ...current, [subject]: nextRange };
    });
    setError("");
  }

  function setUnitPreset(subject: SubjectCode, start: number, end: number) {
    resetQuiz();
    setUnitRanges((current) => ({
      ...current,
      [subject]: { start: String(start), end: String(end) },
    }));
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
    if (step === 2) {
      if (subjects.length === 0) {
        setError("请至少选择一个学习科目。");
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      const missingSubject = orderedSubjects.find((subject) => !textbooks[subject]);
      if (missingSubject) {
        setError(`请为${SUBJECTS[missingSubject].label}选择教材版本。`);
        return;
      }
      setStep(4);
      return;
    }
    if (!isValidExamDate(examDate)) {
      setError("请选择明天到一年以内的考试日期。");
      return;
    }
    setStep(5);
  }

  function goBack() {
    setError("");
    setStep((current) => Math.max(1, current - 1) as QuestionnaireStep);
  }

  function validateExamScope() {
    if (!grade || !isValidExamDate(examDate)) return;
    const missingScope = orderedSubjects.find((subject) => {
      const range = unitRanges[subject];
      return !range || !isValidUnitRange(Number(range.start), Number(range.end));
    });
    if (missingScope) {
      setError(`请为${SUBJECTS[missingScope].label}选择完整的考试 Unit 范围。`);
      return false;
    }
    return true;
  }

  async function generateQuiz() {
    const profile = buildProfilePayload();
    if (!profile || !validateExamScope()) return;

    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/onboarding/diagnostic-quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.quiz) {
        setError(result.error ?? "诊断 Quiz 暂时没有生成，请重试。");
        return;
      }
      setQuiz(result.quiz);
      setAnswers({});
      setQuizResult(null);
      setStep(6);
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitQuiz() {
    const profile = buildProfilePayload();
    if (!profile || !quiz) return;
    if (Object.keys(answers).length !== quiz.questionCount) {
      setError(`还剩 ${quiz.questionCount - Object.keys(answers).length} 道题没有作答。`);
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/onboarding/diagnostic-quiz/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: quiz.id,
          profile,
          answers: quiz.questions.map((question) => ({
            questionId: question.id,
            selectedOption: answers[question.id],
          })),
        }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.profile || !result.result) {
        setError(result.error ?? "Quiz 结果暂时没有保存，请重试。");
        return;
      }
      setCompletedProfile(result.profile);
      setQuizResult(result.result);
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  function finishOnboarding() {
    if (!completedProfile || !quizResult) return;
    if (onComplete) {
      onComplete(completedProfile, quizResult);
    } else {
      window.location.replace("/");
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
      <div className="questionnaire-progress" aria-label={`学习档案设置，第 ${step} 步，共 6 步`}>
        {[1, 2, 3, 4, 5, 6].map((item) => (
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
                <select value={textbooks[subject] ?? ""} onChange={(event) => chooseTextbook(subject, event.target.value)} aria-label={`${SUBJECTS[subject].label}教材版本`}>
                  <option value="">请选择教材版本</option>
                  {getTextbooksForSubject(grade, subject).map((textbook) => <option key={textbook.id} value={textbook.id}>{textbook.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="exam-date-step">
            <div className="exam-date-presets" role="group" aria-label="快速选择考试日期">
              {EXAM_DATE_PRESETS.map((preset) => {
                const value = getDateAfterDays(preset.days);
                return (
                  <button key={preset.days} type="button" className={examDate === value ? "selected" : ""} onClick={() => { resetQuiz(); setExamDate(value); setError(""); }} aria-pressed={examDate === value}>
                    <span>{preset.hint}</span><strong>{preset.label}</strong><small>{formatExamDate(value)}</small><i>{examDate === value ? "✓" : "→"}</i>
                  </button>
                );
              })}
            </div>
            <label className="exam-date-custom">
              <span><small>自定义日期</small><strong>选择具体考试日</strong></span>
              <input type="date" value={examDate} onChange={(event) => { resetQuiz(); setExamDate(event.target.value); setError(""); }} aria-label="计划考试日期" />
            </label>
            {daysUntilExam !== null ? <div className="exam-date-confirmation"><span aria-hidden="true">日</span><div><small>计划考试时间</small><strong>{formatExamDate(examDate)}</strong><p>距离考试还有 {daysUntilExam} 天，知序会从这个日期倒推每日任务。</p></div></div> : null}
          </div>
        ) : null}

        {step === 5 && grade ? (
          <div className="exam-scope-step">
            <div className="exam-scope-summary"><span>考试时间</span><strong>{formatExamDate(examDate)}</strong><small>还有 {daysUntilExam} 天</small></div>
            <div className="exam-scope-list">
              {orderedSubjects.map((subject) => {
                const range = unitRanges[subject] ?? { start: "", end: "" };
                const start = range.start ? Number(range.start) : null;
                const end = range.end ? Number(range.end) : null;
                return (
                  <fieldset className="exam-scope-row" key={subject}>
                    <legend>{SUBJECTS[subject].label}考试范围</legend>
                    <div className="exam-scope-subject"><i aria-hidden="true">{SUBJECTS[subject].glyph}</i><span><strong>{SUBJECTS[subject].label}</strong><small>{getTextbookLabel(grade, subject, textbooks[subject])}</small></span></div>
                    <div className="exam-scope-controls">
                      <label><span>从</span><select value={range.start} onChange={(event) => setUnitBoundary(subject, "start", event.target.value)} aria-label={`${SUBJECTS[subject].label}考试起始单元`}><option value="">选择</option>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unitOptionLabel(subject, unit)}</option>)}</select></label>
                      <b aria-hidden="true">—</b>
                      <label><span>到</span><select value={range.end} onChange={(event) => setUnitBoundary(subject, "end", event.target.value)} aria-label={`${SUBJECTS[subject].label}考试结束单元`}><option value="">选择</option>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit} disabled={Boolean(start && unit < start)}>{unitOptionLabel(subject, unit)}</option>)}</select></label>
                    </div>
                    <div className="exam-scope-presets"><span>快速选择</span><button type="button" className={start === 1 && end === 3 ? "selected" : ""} onClick={() => setUnitPreset(subject, 1, 3)}>Unit 1–3</button><button type="button" className={start === 1 && end === 5 ? "selected" : ""} onClick={() => setUnitPreset(subject, 1, 5)}>Unit 1–5</button></div>
                    <output>{isValidUnitRange(start, end) ? formatExamUnitRange(subject, start, end) : "请选择起止 Unit"}</output>
                  </fieldset>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 6 && quiz ? (
          <DiagnosticQuizStep
            quiz={quiz}
            answers={answers}
            result={quizResult}
            onAnswer={(questionId, optionIndex) => {
              setAnswers((current) => ({ ...current, [questionId]: optionIndex }));
              setError("");
            }}
          />
        ) : null}
      </div>

      <footer className="questionnaire-actions">
        {step > 1 && !quizResult ? <button className="button" type="button" onClick={goBack} disabled={submitting}>上一步</button> : variant === "embedded" && onCancel && !quizResult ? <button className="button" type="button" onClick={onCancel}>取消</button> : <span />}
        {step < 5 ? <button className="button primary" type="button" onClick={goNext}>继续 <span aria-hidden="true">→</span></button> : null}
        {step === 5 ? <button className="button primary" type="button" onClick={generateQuiz} disabled={submitting}>{submitting ? "AI 正在生成 10 题…" : "生成 10 题诊断 Quiz"}</button> : null}
        {step === 6 && !quizResult ? <button className="button primary" type="button" onClick={submitQuiz} disabled={submitting}>{submitting ? "正在分析结果…" : `提交 Quiz（已答 ${Object.keys(answers).length}/10）`}</button> : null}
        {step === 6 && quizResult ? <button className="button primary" type="button" onClick={finishOnboarding}>{variant === "gate" ? "使用诊断结果进入知序" : "保存并返回用户中心"} <span aria-hidden="true">→</span></button> : null}
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
            <p>首次使用 · 约 5 分钟</p>
            <h2>先看考试，<br />再安排每一天。</h2>
            <span>年级、教材、考试日期、Unit 范围和 10 题诊断结果，会成为计划拆解、动态调整和 AI 辅导的共同基础。</span>
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
