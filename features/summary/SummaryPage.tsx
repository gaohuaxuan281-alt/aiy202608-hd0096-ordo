"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  DailyFeedbackAnswers,
  FeedbackAdjustment,
  FeedbackAdjustmentDecision,
  FeedbackAdjustmentResponse,
  FeedbackPageSnapshot,
  FeedbackSnapshotResponse,
} from "./summary-types";

type FeedbackFormState = Omit<DailyFeedbackAnswers, "actualStudyMinutes"> & {
  actualStudyMinutes: string;
};

interface SpeechRecognitionResultEventLike {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function subscribeToSpeechCapability() {
  return () => undefined;
}

function getSpeechCapabilitySnapshot() {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return Boolean(browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition);
}

const quickChoices = ["整体按计划完成", "任务比预期难", "临时安排打断", "专注不足", "体力不足", "需要补基础"];

const operationLabels: Record<FeedbackAdjustment["operation"], string> = {
  move_task: "移动任务",
  split_task: "拆分任务",
  shorten_task: "缩短任务",
  add_practice: "新增练习",
};

const decisionLabels: Record<FeedbackAdjustmentDecision, string> = {
  pending: "等待确认",
  accepted: "已应用到 Timeline",
  rejected: "已拒绝",
};

function emptyForm(date: string): FeedbackFormState {
  return {
    feedbackDate: date,
    energyLevel: 0,
    focusLevel: 0,
    actualStudyMinutes: "",
    quickSelections: [],
    difficultyNotes: "",
    incompleteReason: "",
    unclearKnowledge: "",
    tomorrowChanges: "",
    tomorrowPriority: "",
    additionalNotes: "",
  };
}

function formFromSnapshot(snapshot: FeedbackPageSnapshot): FeedbackFormState {
  const answers = snapshot.feedback?.answers;
  if (!answers) return emptyForm(snapshot.date);
  return {
    ...answers,
    actualStudyMinutes: answers.actualStudyMinutes === null ? "" : String(answers.actualStudyMinutes),
  };
}

function formatShortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.valueOf())) return date;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

function formatTime(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function replaceAdjustment(
  snapshot: FeedbackPageSnapshot,
  adjustment: FeedbackAdjustment,
): FeedbackPageSnapshot {
  if (!snapshot.feedback) return snapshot;
  return {
    ...snapshot,
    feedback: {
      ...snapshot.feedback,
      analysis: {
        ...snapshot.feedback.analysis,
        adjustments: snapshot.feedback.analysis.adjustments.map((item) =>
          item.id === adjustment.id ? adjustment : item,
        ),
      },
    },
  };
}

function AnalysisList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) return <p className="feedback-analysis-empty">{emptyText}</p>;
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function SummaryPage({ initialSnapshot }: { initialSnapshot?: FeedbackPageSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<FeedbackPageSnapshot | null>(initialSnapshot ?? null);
  const [form, setForm] = useState<FeedbackFormState>(() => initialSnapshot ? formFromSnapshot(initialSnapshot) : emptyForm(""));
  const [loading, setLoading] = useState(initialSnapshot === undefined);
  const [submitting, setSubmitting] = useState(false);
  const [loadingDate, setLoadingDate] = useState("");
  const [pendingAdjustmentId, setPendingAdjustmentId] = useState("");
  const [error, setError] = useState("");
  const speechSupported = useSyncExternalStore(
    subscribeToSpeechCapability,
    getSpeechCapabilitySnapshot,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const analysisRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (initialSnapshot !== undefined) return;
    let ignore = false;

    async function loadInitialSnapshot() {
      setLoading(true);
      try {
        const response = await fetch("/api/summary/daily", { cache: "no-store" });
        const result = (await response.json()) as FeedbackSnapshotResponse;
        if (ignore) return;
        if (!response.ok || !result.snapshot) {
          setError(result.error ?? "暂时无法读取今天的反馈数据。");
          return;
        }
        setSnapshot(result.snapshot);
        setForm(formFromSnapshot(result.snapshot));
      } catch {
        if (!ignore) setError("网络连接异常，请稍后重试。");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadInitialSnapshot();
    return () => {
      ignore = true;
    };
  }, [initialSnapshot]);

  const proactiveQuestions = useMemo(() => {
    if (!snapshot) return [];
    const questions: string[] = [];
    const { context } = snapshot;
    if (context.todo.hasPlan && context.todo.completedCount < context.todo.totalCount) {
      questions.push(`今天还有 ${context.todo.totalCount - context.todo.completedCount} 个 Todo 没有完成，主要卡在哪里？`);
    }
    if (context.delayedTasks.length > 0 || context.skippedTasks.length > 0) {
      questions.push(`系统读到 ${context.delayedTasks.length + context.skippedTasks.length} 个延期或跳过任务，明天需要继续保留吗？`);
    }
    questions.push("哪些内容比预期更难，或现在仍然没有弄懂？");
    questions.push("明天是否有临时安排？最需要优先保证哪一件事？");
    return questions.slice(0, 4);
  }, [snapshot]);

  async function loadSnapshot(date?: string) {
    setLoadingDate(date ?? "today");
    setError("");
    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      const response = await fetch(`/api/summary/daily${query}`, { cache: "no-store" });
      const result = (await response.json()) as FeedbackSnapshotResponse;
      if (!response.ok || !result.snapshot) {
        setError(result.error ?? "暂时无法读取这一天的反馈。");
        return;
      }
      setSnapshot(result.snapshot);
      setForm(formFromSnapshot(result.snapshot));
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setLoadingDate("");
      setLoading(false);
    }
  }

  function updateTextField(field: keyof FeedbackFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleQuickChoice(choice: string) {
    setForm((current) => ({
      ...current,
      quickSelections: current.quickSelections.includes(choice)
        ? current.quickSelections.filter((item) => item !== choice)
        : [...current.quickSelections, choice],
    }));
  }

  function toggleVoiceInput() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim();
      if (transcript) {
        setForm((current) => ({
          ...current,
          additionalNotes: `${current.additionalNotes}${current.additionalNotes ? "\n" : ""}${transcript}`,
        }));
      }
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") setError("语音没有识别成功，可以重试或改用文字输入。");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
  }

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot?.isToday) return;
    if (form.energyLevel === 0 || form.focusLevel === 0) {
      setError("请先选择今天的精力和专注程度。");
      return;
    }

    const actualStudyMinutes = form.actualStudyMinutes.trim() === ""
      ? null
      : Number(form.actualStudyMinutes);
    if (actualStudyMinutes !== null && (!Number.isFinite(actualStudyMinutes) || actualStudyMinutes < 0 || actualStudyMinutes > 1_440)) {
      setError("实际学习时长请填写 0–1440 之间的分钟数。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/summary/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, actualStudyMinutes }),
      });
      const result = (await response.json()) as FeedbackSnapshotResponse;
      if (!response.ok || !result.snapshot) {
        setError(result.error ?? "AI 暂时无法生成反馈总结，请稍后重试。");
        return;
      }
      setSnapshot(result.snapshot);
      setForm(formFromSnapshot(result.snapshot));
      window.setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch {
      setError("网络连接异常，今天的反馈还没有提交成功。");
    } finally {
      setSubmitting(false);
    }
  }

  async function decideAdjustment(adjustment: FeedbackAdjustment, decision: Exclude<FeedbackAdjustmentDecision, "pending">) {
    if (!snapshot?.isToday || adjustment.decision !== "pending") return;
    setPendingAdjustmentId(adjustment.id);
    setError("");
    try {
      const response = await fetch("/api/summary/adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustmentId: adjustment.id, decision }),
      });
      const result = (await response.json()) as FeedbackAdjustmentResponse;
      if (!response.ok) {
        setError(result.error ?? "计划调整没有处理成功，请稍后重试。");
        return;
      }
      if (result.snapshot) setSnapshot(result.snapshot);
      else if (result.adjustment) setSnapshot((current) => current ? replaceAdjustment(current, result.adjustment!) : current);
      else await loadSnapshot(snapshot.date);
    } catch {
      setError("网络连接异常，Timeline 尚未发生变化。");
    } finally {
      setPendingAdjustmentId("");
    }
  }

  return (
    <div className="feedback-page">
      <header className="page-heading feedback-heading">
        <div>
          <p className="eyebrow">DAILY FEEDBACK LOOP</p>
          <h1>把今天说清楚，明天才会更准。</h1>
          <p>系统先读取 Todo、Timeline、AI Tutor 和日志，再请你补充只有你知道的情况。任何计划修改都要由你确认。</p>
        </div>
        <div className="heading-actions">
          {!snapshot?.isToday ? <button className="button" type="button" onClick={() => loadSnapshot()} disabled={Boolean(loadingDate)}>回到今天</button> : null}
          <button className="button" type="button" onClick={() => loadSnapshot(snapshot?.isToday ? undefined : snapshot?.date)} disabled={Boolean(loadingDate)}>{loadingDate ? "刷新中…" : "↻ 刷新数据"}</button>
          <Link className="button primary" href="/timeline">查看 Timeline</Link>
        </div>
      </header>

      {error ? <div className="feedback-error" role="alert"><span aria-hidden="true">!</span><p>{error}</p><button type="button" onClick={() => setError("")} aria-label="关闭提示">×</button></div> : null}

      {loading ? <section className="feedback-loading" aria-live="polite"><span aria-hidden="true" /><strong>正在读取今天的学习记录…</strong><p>系统会自动汇总 Todo、Timeline、AI Tutor 和日志。</p></section> : null}

      {!loading && !snapshot ? (
        <section className="feedback-empty-state">
          <span aria-hidden="true">◇</span>
          <h2>还没有读到反馈上下文</h2>
          <p>数据不会用示例内容填充。请检查网络后重新读取今天的真实学习记录。</p>
          <button className="button primary" type="button" onClick={() => loadSnapshot()} disabled={Boolean(loadingDate)}>重新读取</button>
        </section>
      ) : null}

      {snapshot ? (
        <>
          <section className="feedback-day-nav" aria-label="反馈日期">
            <div>
              <span>{snapshot.isToday ? "今天的反馈" : "历史反馈"}</span>
              <strong>{formatShortDate(snapshot.date)}</strong>
            </div>
            <div className="feedback-history-list">
              {snapshot.history.length === 0 ? <small>提交后会在这里形成每日记录</small> : snapshot.history.map((item) => (
                <button
                  className={item.date === snapshot.date ? "active" : ""}
                  type="button"
                  key={item.id}
                  onClick={() => loadSnapshot(item.date)}
                  disabled={loadingDate === item.date}
                  aria-current={item.date === snapshot.date ? "date" : undefined}
                >
                  <span>{formatShortDate(item.date)}</span>
                  <strong>{item.headline || "已完成反馈"}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="feedback-context-section" aria-labelledby="feedback-context-title">
            <div className="feedback-section-heading">
              <div><span className="feedback-section-number">01</span><div><h2 id="feedback-context-title">系统已经知道的事</h2><p>这些数据来自现有模块，不需要你重复填写。</p></div></div>
              <span className="feedback-live-badge"><i aria-hidden="true" /> 已同步真实数据</span>
            </div>

            <div className="feedback-context-grid">
              <article>
                <span className="feedback-context-icon primary" aria-hidden="true">✓</span>
                <div><small>Todo 完成</small><strong>{snapshot.context.todo.hasPlan ? `${snapshot.context.todo.completedCount} / ${snapshot.context.todo.totalCount}` : "暂无 Todo"}</strong><p>{snapshot.context.todo.completionPercent === null ? "尚无可计算的今日任务" : `完成率 ${snapshot.context.todo.completionPercent}%`}</p></div>
              </article>
              <article>
                <span className="feedback-context-icon teal" aria-hidden="true">◷</span>
                <div><small>学习时长</small><strong>{snapshot.context.todo.hasPlan ? `${snapshot.context.todo.completedMinutesEstimate} 分钟` : "暂无记录"}</strong><p>{snapshot.context.todo.hasPlan ? `按完成任务估算 · 今日计划 ${snapshot.context.todo.plannedMinutes} 分钟` : "等待 Timeline 和 Todo 数据"}</p></div>
              </article>
              <article>
                <span className="feedback-context-icon amber" aria-hidden="true">↘</span>
                <div><small>延期 / 跳过</small><strong>{snapshot.context.delayedTasks.length + snapshot.context.skippedTasks.length} 项</strong><p>{snapshot.context.delayedTasks.length} 项延期 · {snapshot.context.skippedTasks.length} 项跳过</p></div>
              </article>
              <article>
                <span className="feedback-context-icon violet" aria-hidden="true">✦</span>
                <div><small>AI Tutor 使用</small><strong>{snapshot.context.tutor.sessionCount} 次会话</strong><p>{snapshot.context.tutor.messageCount} 条消息{formatTime(snapshot.context.tutor.lastUsedAt) ? ` · 最近 ${formatTime(snapshot.context.tutor.lastUsedAt)}` : ""}</p></div>
              </article>
              <article>
                <span className="feedback-context-icon ink" aria-hidden="true">▤</span>
                <div><small>今日日志</small><strong>{snapshot.context.journal.count} 条</strong><p>{snapshot.context.journal.highlights[0]?.title ?? "今天还没有操作记录"}</p></div>
              </article>
              <article>
                <span className="feedback-context-icon mint" aria-hidden="true">→</span>
                <div><small>剩余 Timeline</small><strong>{snapshot.context.remainingTimeline.taskCount} 个任务</strong><p>{snapshot.context.remainingTimeline.totalMinutes} 分钟待安排或执行</p></div>
              </article>
            </div>
          </section>

          {snapshot.isToday ? (
            <section className="feedback-dialogue-section" aria-labelledby="feedback-dialogue-title">
              <div className="feedback-section-heading">
                <div><span className="feedback-section-number">02</span><div><h2 id="feedback-dialogue-title">补充只有你知道的情况</h2><p>可以快捷选择、文字输入或直接说话。</p></div></div>
              </div>

              <div className="feedback-dialogue-layout">
                <aside className="feedback-ai-questions">
                  <div className="feedback-ai-identity"><span aria-hidden="true">✦</span><div><strong>知序 AI</strong><small>基于今日数据主动追问</small></div></div>
                  <div className="feedback-question-list">
                    {proactiveQuestions.map((question, index) => <p key={question}><span>{String(index + 1).padStart(2, "0")}</span>{question}</p>)}
                  </div>
                  <p className="feedback-context-note">系统数据只作为事实输入；你的补充用于解释偏差，不会覆盖原始日志。</p>
                </aside>

                <form className="feedback-form" onSubmit={submitFeedback}>
                  <fieldset className="feedback-rating-fieldset">
                    <legend>今天的状态怎么样？</legend>
                    <div className="feedback-rating-row">
                      <span>精力</span>
                      <div>{[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} className={form.energyLevel === level ? "active" : ""} onClick={() => setForm((current) => ({ ...current, energyLevel: level }))} aria-pressed={form.energyLevel === level} aria-label={`精力 ${level} 分`}>{level}</button>)}</div>
                      <small>{form.energyLevel ? `${form.energyLevel}/5` : "待选择"}</small>
                    </div>
                    <div className="feedback-rating-row">
                      <span>专注</span>
                      <div>{[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} className={form.focusLevel === level ? "active" : ""} onClick={() => setForm((current) => ({ ...current, focusLevel: level }))} aria-pressed={form.focusLevel === level} aria-label={`专注 ${level} 分`}>{level}</button>)}</div>
                      <small>{form.focusLevel ? `${form.focusLevel}/5` : "待选择"}</small>
                    </div>
                  </fieldset>

                  <fieldset className="feedback-quick-fieldset">
                    <legend>快捷选择（可多选）</legend>
                    <div>{quickChoices.map((choice) => <button type="button" key={choice} className={form.quickSelections.includes(choice) ? "active" : ""} onClick={() => toggleQuickChoice(choice)} aria-pressed={form.quickSelections.includes(choice)}>{form.quickSelections.includes(choice) ? "✓ " : "+ "}{choice}</button>)}</div>
                  </fieldset>

                  <label className="feedback-duration-field">
                    <span>今天实际学习了多久？</span>
                    <div><input type="number" inputMode="numeric" min="0" max="1440" value={form.actualStudyMinutes} onChange={(event) => updateTextField("actualStudyMinutes", event.target.value)} placeholder="分钟" /><em>分钟</em></div>
                    <small>上方展示的是完成任务的计划时长估算，不会冒充实际用时；不知道时可以留空。</small>
                  </label>

                  <div className="feedback-text-grid">
                    <label><span>哪些任务比预期更难？</span><textarea rows={3} value={form.difficultyNotes} onChange={(event) => updateTextField("difficultyNotes", event.target.value)} placeholder="例如：题型看得懂，但独立列式仍然很慢" /></label>
                    <label><span>没有完成的主要原因是什么？</span><textarea rows={3} value={form.incompleteReason} onChange={(event) => updateTextField("incompleteReason", event.target.value)} placeholder="没有未完成任务时可以留空" /></label>
                    <label><span>还有哪些知识点没有弄懂？</span><textarea rows={3} value={form.unclearKnowledge} onChange={(event) => updateTextField("unclearKnowledge", event.target.value)} placeholder="写下概念、题型或具体问题" /></label>
                    <label><span>明天有什么临时安排？</span><textarea rows={3} value={form.tomorrowChanges} onChange={(event) => updateTextField("tomorrowChanges", event.target.value)} placeholder="例如：19:00–20:00 临时有课" /></label>
                  </div>

                  <label className="feedback-priority-field"><span>明天必须优先保证什么？</span><input value={form.tomorrowPriority} onChange={(event) => updateTextField("tomorrowPriority", event.target.value)} placeholder="一个最重要的学习目标" /></label>

                  <label className="feedback-voice-field">
                    <span>还有什么想补充的？</span>
                    <textarea rows={4} value={form.additionalNotes} onChange={(event) => updateTextField("additionalNotes", event.target.value)} placeholder="可以打字，也可以用下方语音按钮补充" />
                    <span className="feedback-voice-actions">
                      <button className={listening ? "listening" : ""} type="button" onClick={toggleVoiceInput} disabled={!speechSupported} aria-pressed={listening}>{listening ? "■ 停止并识别" : "● 语音补充"}</button>
                      <small>{speechSupported ? (listening ? "正在聆听，请直接说话…" : "语音只会转成文字，经你确认后提交") : "当前浏览器不支持语音识别，请使用文字输入"}</small>
                    </span>
                  </label>

                  <div className="feedback-submit-bar">
                    <div><strong>提交后 AI 会生成总结和计划调整草案</strong><small>草案不会自动修改 Timeline；每一项都需要你单独确认。</small></div>
                    <button className="button primary" type="submit" disabled={submitting}>{submitting ? "AI 正在分析…" : snapshot.feedback ? "重新分析今天 →" : "生成今日反馈 →"}</button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          {snapshot.feedback ? (
            <section className="feedback-result-section" ref={analysisRef} aria-labelledby="feedback-result-title">
              <div className="feedback-section-heading">
                <div><span className="feedback-section-number">03</span><div><h2 id="feedback-result-title">AI 反馈总结</h2><p>事实、判断和建议分开呈现，便于你检查。</p></div></div>
                <span className="feedback-result-time">生成于 {formatTime(snapshot.feedback.analysis.generatedAt) ?? snapshot.feedback.date}</span>
              </div>

              <article className="feedback-result-hero">
                <div><span aria-hidden="true">✦</span><div><small>今日结论</small><h3>{snapshot.feedback.analysis.headline}</h3><p>{snapshot.feedback.analysis.todaySummary}</p></div></div>
              </article>

              <div className="feedback-analysis-grid">
                <article className="wide"><span>计划与实际偏差</span><p>{snapshot.feedback.analysis.planActualDeviation}</p></article>
                <article><span>偏差原因</span><AnalysisList items={snapshot.feedback.analysis.deviationReasons} emptyText="本次没有识别到明确的偏差原因。" /></article>
                <article><span>新发现的薄弱点</span><AnalysisList items={snapshot.feedback.analysis.weakKnowledgePoints} emptyText="本次没有新增薄弱知识点。" /></article>
                <article><span>明日风险</span><AnalysisList items={snapshot.feedback.analysis.tomorrowRisks} emptyText="本次没有识别到明确风险。" /></article>
                <article><span>行动建议</span><AnalysisList items={snapshot.feedback.analysis.recommendations} emptyText="本次没有额外行动建议。" /></article>
              </div>

              <section className="feedback-adjustment-section" aria-labelledby="feedback-adjustment-title">
                <header>
                  <div><span>Timeline 修改草案</span><h3 id="feedback-adjustment-title">你确认后，计划才会改变。</h3></div>
                  <Link href="/timeline">先查看当前 Timeline →</Link>
                </header>

                {snapshot.feedback.analysis.adjustments.length === 0 ? (
                  <div className="feedback-no-adjustments"><span aria-hidden="true">✓</span><div><strong>今天不需要调整 Timeline</strong><p>AI 没有生成计划修改草案，现有计划保持不变。</p></div></div>
                ) : (
                  <div className="feedback-adjustment-list">
                    {snapshot.feedback.analysis.adjustments.map((adjustment) => (
                      <article className={`feedback-adjustment-card ${adjustment.decision}`} key={adjustment.id}>
                        <div className="feedback-adjustment-topline"><span>{operationLabels[adjustment.operation]}</span><em>{decisionLabels[adjustment.decision]}</em></div>
                        <h4>{adjustment.title}</h4>
                        <p>{adjustment.description}</p>
                        <div className="feedback-diff">
                          <div><small>调整前</small><strong>{adjustment.before}</strong></div>
                          <span aria-hidden="true">→</span>
                          <div><small>调整后</small><strong>{adjustment.after}</strong></div>
                        </div>
                        <div className="feedback-adjustment-reason"><span>为什么这样调</span><p>{adjustment.reason}</p></div>
                        {adjustment.decision === "pending" && snapshot.isToday ? (
                          <div className="feedback-adjustment-actions">
                            <button type="button" onClick={() => decideAdjustment(adjustment, "rejected")} disabled={Boolean(pendingAdjustmentId)}>{pendingAdjustmentId === adjustment.id ? "处理中…" : "暂不采用"}</button>
                            <button className="accept" type="button" onClick={() => decideAdjustment(adjustment, "accepted")} disabled={Boolean(pendingAdjustmentId)}>{pendingAdjustmentId === adjustment.id ? "正在应用…" : "确认并应用"}</button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}

                <p className="feedback-confirmation-note"><span aria-hidden="true">⌁</span> 接受后，系统会写入 Timeline；Todo 将从最新 Timeline 自动重新派生，日志会保留本次调整的原因与前后变化。</p>
              </section>
            </section>
          ) : !snapshot.isToday ? (
            <section className="feedback-history-empty"><span aria-hidden="true">◇</span><h2>这一天没有反馈总结</h2><p>系统不会补造历史数据。</p></section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
