"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DiagnosticQuizStep } from "../onboarding/DiagnosticQuizStep";
import {
  GRADES,
  SUBJECTS,
  getSubjectsForGrade,
  getTextbooksForSubject,
  type GradeCode,
  type SubjectCode,
} from "../../config/learning-catalog";
import { MAX_EXAM_UNIT } from "../../lib/exam-plan";
import type {
  DiagnosticQuiz,
  DiagnosticQuizResult,
} from "../../lib/diagnostic-quiz-types";
import type { StoredStudyPlan } from "../../lib/study-plan/types";

type TimelinePlanResponse = {
  error?: string;
  plan?: StoredStudyPlan | null;
};

type QuizGenerateResponse = {
  error?: string;
  quiz?: DiagnosticQuiz;
};

type QuizCompleteResponse = {
  error?: string;
  result?: DiagnosticQuizResult;
};

type TimelineCreateSubjectInput = {
  id: string;
  subject: SubjectCode | "";
  textbook: string;
  examUnitStart: string;
  examUnitEnd: string;
};

type TimelineCreateForm = {
  grade: GradeCode | "";
  examName: string;
  examDate: string;
  studyStartTime: string;
  studyEndTime: string;
  extraContext: string;
  subjects: TimelineCreateSubjectInput[];
};

function createSubjectInput(): TimelineCreateSubjectInput {
  return {
    id: crypto.randomUUID(),
    subject: "",
    textbook: "",
    examUnitStart: "",
    examUnitEnd: "",
  };
}

function createInitialForm(): TimelineCreateForm {
  return {
    grade: "",
    examName: "",
    examDate: "",
    studyStartTime: "",
    studyEndTime: "",
    extraContext: "",
    subjects: [createSubjectInput()],
  };
}

function parseTimeToMinutes(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return Number.NaN;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function buildProfilePayload(form: TimelineCreateForm) {
  return {
    grade: form.grade,
    examDate: form.examDate,
    dailyStudyStart: form.studyStartTime,
    dailyStudyEnd: form.studyEndTime,
    additionalNotes: form.extraContext,
    subjects: form.subjects.map((item) => ({
      subject: item.subject,
      textbook: item.textbook,
      examUnitStart: Number(item.examUnitStart),
      examUnitEnd: Number(item.examUnitEnd),
    })),
  };
}

function buildTimelinePayload(form: TimelineCreateForm) {
  const startMinutes = parseTimeToMinutes(form.studyStartTime);
  const endMinutes = parseTimeToMinutes(form.studyEndTime);
  const dailyAvailableMinutes = endMinutes - startMinutes;

  return {
    examName: form.examName.trim(),
    examDate: form.examDate,
    targetScore: "",
    dailyAvailableMinutes,
    preferredStartTime: form.studyStartTime,
    unavailableWindows: "",
    fixedCommitments: `每日学习结束时间：${form.studyEndTime}`,
    mustKeepBoundaries: `请不要把任务安排到 ${form.studyEndTime} 之后。`,
    focusStrategy: "",
    extraContext: [
      form.extraContext.trim(),
      `每日学习时间窗口：${form.studyStartTime}-${form.studyEndTime}。请尽量把所有任务安排在这个时间段内。`,
    ].filter(Boolean).join("\n"),
  };
}

export function TimelineCreatePage() {
  const router = useRouter();
  const [form, setForm] = useState<TimelineCreateForm>(createInitialForm);
  const [quiz, setQuiz] = useState<DiagnosticQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<DiagnosticQuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const subjectOptions = useMemo(
    () => (form.grade ? getSubjectsForGrade(form.grade) : []),
    [form.grade],
  );

  const answeredCount = Object.keys(answers).length;

  function updateSubject(id: string, patch: Partial<TimelineCreateSubjectInput>) {
    setForm((current) => ({
      ...current,
      subjects: current.subjects.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  }

  function addSubject() {
    setForm((current) => ({
      ...current,
      subjects: [...current.subjects, createSubjectInput()],
    }));
  }

  function removeSubject(id: string) {
    setForm((current) => ({
      ...current,
      subjects: current.subjects.length === 1
        ? current.subjects
        : current.subjects.filter((item) => item.id !== id),
    }));
  }

  function validateForm() {
    if (!form.grade) return "请先选择年级。";
    if (form.examName.trim().length < 2) return "请填写考试名字。";
    if (!form.examDate) return "请填写考试时间。";
    if (!form.studyStartTime || !form.studyEndTime) return "请填写每日学习开始和结束时间。";
    const startMinutes = parseTimeToMinutes(form.studyStartTime);
    const endMinutes = parseTimeToMinutes(form.studyEndTime);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
      return "每日学习结束时间必须晚于开始时间。";
    }
    if (form.subjects.length === 0) return "请至少添加一个学科。";
    const usedSubjects = new Set<string>();
    for (const item of form.subjects) {
      if (!item.subject) return "请为每一行选择学科。";
      if (usedSubjects.has(item.subject)) return "学科不能重复，请合并相同学科的设置。";
      usedSubjects.add(item.subject);
      if (!item.textbook) return `请为 ${SUBJECTS[item.subject].label} 选择教材。`;
      const start = Number(item.examUnitStart);
      const end = Number(item.examUnitEnd);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > MAX_EXAM_UNIT || start > end) {
        return `请为 ${SUBJECTS[item.subject].label} 选择正确的考试单元范围。`;
      }
    }
    return "";
  }

  async function createTimelineOnly() {
    const response = await fetch("/api/timeline/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildTimelinePayload(form)),
    });
    const result = (await response.json()) as TimelinePlanResponse;
    if (!response.ok || !result.plan) {
      throw new Error(result.error ?? "Timeline 生成失败，请稍后重试。");
    }
  }

  async function startQuiz() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");
    setQuizResult(null);
    try {
      const response = await fetch("/api/onboarding/diagnostic-quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: buildProfilePayload(form),
        }),
      });
      const result = (await response.json()) as QuizGenerateResponse;
      if (!response.ok || !result.quiz) {
        setError(result.error ?? "10 题 Quiz 生成失败，请稍后重试。");
        return;
      }
      setQuiz(result.quiz);
      setAnswers({});
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  function onAnswer(questionId: string, optionIndex: number) {
    setAnswers((current) => ({
      ...current,
      [questionId]: optionIndex,
    }));
  }

  async function completeQuizAndCreateTimeline() {
    if (!quiz) return;
    if (answeredCount !== 10) {
      setError("请先完成全部 10 道题。");
      return;
    }
    const confirmed = window.confirm("确认根据这次 Quiz 结果生成新的 Timeline 吗？生成后会新增到 Timeline 列表顶部，不会覆盖旧计划。");
    if (!confirmed) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/diagnostic-quiz/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: quiz.id,
          profile: buildProfilePayload(form),
          answers: quiz.questions.map((question) => ({
            questionId: question.id,
            selectedOption: answers[question.id]!,
          })),
        }),
      });
      const result = (await response.json()) as QuizCompleteResponse;
      if (!response.ok || !result.result) {
        setError(result.error ?? "Quiz 提交失败，请稍后重试。");
        return;
      }
      setQuizResult(result.result);
      await createTimelineOnly();
      router.push("/timeline");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Timeline 生成失败，请稍后重试。";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function retryCreateTimeline() {
    if (!quizResult) return;
    const confirmed = window.confirm("确认根据刚才的 Quiz 结果重新生成 Timeline 吗？");
    if (!confirmed) return;

    setSubmitting(true);
    setError("");
    try {
      await createTimelineOnly();
      router.push("/timeline");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Timeline 生成失败，请稍后重试。";
      setError(message);
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
          <p>这里只保留 8 个问题。你填完后会先生成 10 道诊断 Quiz，完成后系统再据此创建新的 Timeline。</p>
        </div>
        <div className="heading-actions">
          <Link className="button" href="/timeline">返回 Timeline</Link>
        </div>
      </header>

      {error ? <div className="planner-error" role="alert">{error}</div> : null}

      {!quiz ? (
        <section className="planner-card planner-form-shell">
          <div className="planner-card-heading">
            <div>
              <small>创建计划</small>
              <h2>基础信息与考试范围</h2>
            </div>
            <span>先填信息，再生成 10 题 Quiz</span>
          </div>

          <div className="planner-form">
            <label>
              <span>年级</span>
              <select
                value={form.grade}
                onChange={(event) => setForm({
                  ...createInitialForm(),
                  grade: event.target.value as GradeCode | "",
                  subjects: [createSubjectInput()],
                })}
              >
                <option value="">请选择年级</option>
                {GRADES.map((grade) => (
                  <option key={grade.id} value={grade.id}>{grade.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>考试名字</span>
              <input
                value={form.examName}
                onChange={(event) => setForm((current) => ({ ...current, examName: event.target.value }))}
              />
            </label>
            <label>
              <span>考试时间</span>
              <input
                type="date"
                value={form.examDate}
                onChange={(event) => setForm((current) => ({ ...current, examDate: event.target.value }))}
              />
            </label>
            <label>
              <span>每日学习开始时间</span>
              <input
                type="time"
                value={form.studyStartTime}
                onChange={(event) => setForm((current) => ({ ...current, studyStartTime: event.target.value }))}
              />
            </label>
            <label>
              <span>每日学习结束时间</span>
              <input
                type="time"
                value={form.studyEndTime}
                onChange={(event) => setForm((current) => ({ ...current, studyEndTime: event.target.value }))}
              />
            </label>
            <label className="planner-field-full">
              <span>额外说明（AI 会根据这个灵活调整）</span>
              <textarea
                rows={3}
                value={form.extraContext}
                onChange={(event) => setForm((current) => ({ ...current, extraContext: event.target.value }))}
              />
            </label>

            <div className="planner-field-full timeline-subjects-shell">
              <div className="planner-card-heading">
                <div>
                  <small>学科信息</small>
                  <h2>学科 / 教材 / 考试单元</h2>
                </div>
                <button className="button" type="button" onClick={addSubject} disabled={!form.grade}>添加学科</button>
              </div>

              <div className="timeline-subject-list">
                {form.subjects.map((item, index) => {
                  const textbooks = form.grade && item.subject
                    ? getTextbooksForSubject(form.grade, item.subject)
                    : [];
                  return (
                    <section key={item.id} className="timeline-subject-card">
                      <div className="timeline-subject-card-head">
                        <strong>学科 {index + 1}</strong>
                        {form.subjects.length > 1 ? (
                          <button className="button" type="button" onClick={() => removeSubject(item.id)}>移除</button>
                        ) : null}
                      </div>
                      <div className="timeline-subject-grid">
                        <label>
                          <span>学科</span>
                          <select
                            value={item.subject}
                            onChange={(event) => updateSubject(item.id, {
                              subject: event.target.value as SubjectCode | "",
                              textbook: "",
                            })}
                          >
                            <option value="">请选择学科</option>
                            {subjectOptions.map((subjectCode) => (
                              <option key={subjectCode} value={subjectCode}>{SUBJECTS[subjectCode].label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>教材</span>
                          <select
                            value={item.textbook}
                            onChange={(event) => updateSubject(item.id, { textbook: event.target.value })}
                            disabled={!form.grade || !item.subject}
                          >
                            <option value="">请选择教材</option>
                            {textbooks.map((textbook) => (
                              <option key={textbook.id} value={textbook.id}>{textbook.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>考试单元开始</span>
                          <select
                            value={item.examUnitStart}
                            onChange={(event) => updateSubject(item.id, { examUnitStart: event.target.value })}
                          >
                            <option value="">开始</option>
                            {Array.from({ length: MAX_EXAM_UNIT }, (_, index) => index + 1).map((unit) => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>考试单元结束</span>
                          <select
                            value={item.examUnitEnd}
                            onChange={(event) => updateSubject(item.id, { examUnitEnd: event.target.value })}
                          >
                            <option value="">结束</option>
                            {Array.from({ length: MAX_EXAM_UNIT }, (_, index) => index + 1).map((unit) => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="timeline-create-actions">
            <button className="button primary" type="button" onClick={startQuiz} disabled={submitting}>
              {submitting ? "Quiz 生成中…" : "生成 10 题 Quiz"}
            </button>
          </div>
        </section>
      ) : (
        <section className="planner-card planner-form-shell">
          <div className="planner-card-heading">
            <div>
              <small>10 题诊断 Quiz</small>
              <h2>{form.examName || "本次考试诊断"}</h2>
            </div>
            <span>{quizResult ? "诊断已完成" : "完成 10 题后创建 Timeline"}</span>
          </div>

          <div className="timeline-create-summary">
            <span>{GRADES.find((item) => item.id === form.grade)?.label ?? "未选年级"}</span>
            <span>{form.examDate || "未选考试时间"}</span>
            <span>{form.studyStartTime && form.studyEndTime ? `${form.studyStartTime}-${form.studyEndTime}` : "未设学习时间"}</span>
            <span>{form.subjects.map((item) => item.subject ? SUBJECTS[item.subject].label : "未选学科").join("、")}</span>
          </div>

          <DiagnosticQuizStep
            quiz={quiz}
            answers={answers}
            result={quizResult}
            onAnswer={onAnswer}
          />

          <div className="timeline-create-actions">
            {!quizResult ? (
              <button
                className="button primary"
                type="button"
                onClick={completeQuizAndCreateTimeline}
                disabled={submitting || answeredCount !== 10}
              >
                {submitting ? "正在生成 Timeline…" : `确认生成 Timeline（${answeredCount}/10）`}
              </button>
            ) : (
              <button
                className="button primary"
                type="button"
                onClick={retryCreateTimeline}
                disabled={submitting}
              >
                {submitting ? "正在生成 Timeline…" : "继续生成 Timeline"}
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
