import "server-only";

import type {
  DailyFeedbackAnswers,
  DailyFeedbackRecord,
  DailyFeedbackStatus,
  FeedbackAdjustment,
  FeedbackAIAnalysis,
  FeedbackHistoryItem,
  FeedbackPageSnapshot,
  FeedbackSystemContext,
} from "../features/summary/summary-types";
import type { HomeSummarySlice } from "../features/home/home-types";
import type { StoredStudyPlan, StudyPlanTask } from "./study-plan/types";
import { getD1 } from "../db";
import { getAIModuleUsage } from "./ai-store";
import { ensureAuthSchema } from "./auth";
import { listJournalEntries } from "./journal-store";
import {
  applyFeedbackAdjustment,
  getLatestStudyPlan,
  getStudyPlanById,
} from "./study-plan/store";

type DailyFeedbackRow = {
  id: string;
  feedbackDate: string;
  status: DailyFeedbackStatus;
  basePlanId: string | null;
  basePlanUpdatedAt: number | null;
  energyLevel: number;
  focusLevel: number;
  actualStudyMinutes: number | null;
  quickSelectionsJson: string;
  difficultyNotes: string;
  incompleteReason: string;
  unclearKnowledge: string;
  tomorrowChanges: string;
  tomorrowPriority: string;
  additionalNotes: string;
  systemContextJson: string;
  aiSummaryJson: string;
  model: string;
  createdAt: number;
  updatedAt: number;
};

type AdjustmentRow = {
  id: string;
  feedbackId: string;
  basePlanId: string | null;
  basePlanUpdatedAt: number | null;
  operation: FeedbackAdjustment["operation"];
  taskId: string | null;
  title: string;
  description: string;
  reason: string;
  beforeJson: string;
  afterJson: string;
  decision: FeedbackAdjustment["decision"] | "applying";
  decidedAt: number | null;
  createdAt: number;
};

type StoredBefore = {
  label: string;
  task: Partial<StudyPlanTask> | null;
  basePlanVersion: number | null;
};

type StoredAfter = {
  label: string;
  payload: NonNullable<FeedbackAdjustment["payload"]>;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getShanghaiDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function isValidFeedbackDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateBounds(date: string) {
  const start = Date.parse(`${date}T00:00:00+08:00`);
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function toContextTask(task: StudyPlanTask) {
  return {
    id: task.id,
    title: task.title,
    subject: task.subject,
    date: task.date,
    timeLabel: `${task.startTime}–${task.endTime}`,
    durationMinutes: task.durationMinutes,
    status: task.status,
  };
}

export async function buildFeedbackSystemContext(
  userId: string,
  date = getShanghaiDateKey(),
): Promise<FeedbackSystemContext> {
  if (!isValidFeedbackDate(date)) throw new Error("FEEDBACK_DATE_INVALID");
  const { start, end } = dateBounds(date);
  const [plan, entries, tutor] = await Promise.all([
    getLatestStudyPlan(userId),
    listJournalEntries(userId, 250),
    getAIModuleUsage(userId, "ai-tutor", start, end),
  ] as const);

  const planTasks = plan?.plan.tasks ?? [];
  const todayTasks = planTasks.filter(
    (task) => task.date === date && task.status !== "cancelled",
  );
  const completedTasks = todayTasks.filter((task) => task.status === "completed");
  const delayedTasks = planTasks.filter(
    (task) => task.date === date && task.status === "delayed",
  );
  const skippedTasks = planTasks.filter(
    (task) => task.date === date && task.status === "cancelled",
  );
  const remainingTasks = planTasks
    .filter((task) =>
      task.date >= date &&
      task.status !== "completed" &&
      task.status !== "cancelled",
    )
    .toSorted((left, right) =>
      `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`),
    );
  const dayEntries = entries.filter((entry) => {
    const occurredAt = new Date(entry.occurredAt).getTime();
    return occurredAt >= start && occurredAt < end;
  });
  const totalCount = todayTasks.length;

  return {
    date,
    todo: {
      hasPlan: Boolean(plan),
      totalCount,
      completedCount: completedTasks.length,
      completionPercent: totalCount
        ? Math.round((completedTasks.length / totalCount) * 100)
        : null,
      plannedMinutes: todayTasks.reduce((sum, task) => sum + task.durationMinutes, 0),
      completedMinutesEstimate: completedTasks.reduce(
        (sum, task) => sum + task.durationMinutes,
        0,
      ),
    },
    delayedTasks: delayedTasks.map(toContextTask),
    skippedTasks: skippedTasks.map(toContextTask),
    tutor: {
      sessionCount: tutor.sessionCount,
      messageCount: tutor.messageCount,
      lastUsedAt: tutor.lastUsedAt ? new Date(tutor.lastUsedAt).toISOString() : null,
    },
    journal: {
      count: dayEntries.length,
      highlights: dayEntries.slice(0, 5).map((entry) => ({
        id: entry.id,
        title: entry.title,
        occurredAt: entry.occurredAt,
        moduleLabel: entry.moduleLabel,
      })),
    },
    remainingTimeline: {
      taskCount: remainingTasks.length,
      totalMinutes: remainingTasks.reduce((sum, task) => sum + task.durationMinutes, 0),
      tasks: remainingTasks.slice(0, 8).map(toContextTask),
    },
  };
}

function hydrateAdjustment(row: AdjustmentRow): FeedbackAdjustment {
  const before = parseJson<StoredBefore>(row.beforeJson, {
    label: "未记录",
    task: null,
    basePlanVersion: null,
  });
  const after = parseJson<StoredAfter>(row.afterJson, { label: "未记录", payload: {} });
  return {
    id: row.id,
    proposalId: row.feedbackId,
    targetTaskId: row.taskId,
    basePlanId: row.basePlanId,
    basePlanVersion: before.basePlanVersion,
    operation: row.operation,
    title: row.title,
    description: row.description,
    reason: row.reason,
    before: before.label,
    after: after.label,
    decision: row.decision === "applying" ? "pending" : row.decision,
    decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
    payload: after.payload,
  };
}

async function listAdjustments(feedbackId: string) {
  const result = await getD1()
    .prepare(`SELECT
      id,
      feedback_id AS feedbackId,
      base_plan_id AS basePlanId,
      base_plan_updated_at AS basePlanUpdatedAt,
      operation,
      task_id AS taskId,
      title,
      description,
      reason,
      before_json AS beforeJson,
      after_json AS afterJson,
      decision,
      decided_at AS decidedAt,
      created_at AS createdAt
    FROM feedback_adjustments
    WHERE feedback_id = ?
    ORDER BY created_at ASC`)
    .bind(feedbackId)
    .all<AdjustmentRow>();
  return result.results ?? [];
}

function rowAnswers(row: DailyFeedbackRow): DailyFeedbackAnswers {
  return {
    feedbackDate: row.feedbackDate,
    energyLevel: row.energyLevel,
    focusLevel: row.focusLevel,
    actualStudyMinutes: row.actualStudyMinutes,
    quickSelections: parseJson<string[]>(row.quickSelectionsJson, []),
    difficultyNotes: row.difficultyNotes,
    incompleteReason: row.incompleteReason,
    unclearKnowledge: row.unclearKnowledge,
    tomorrowChanges: row.tomorrowChanges,
    tomorrowPriority: row.tomorrowPriority,
    additionalNotes: row.additionalNotes,
  };
}

async function hydrateFeedback(row: DailyFeedbackRow): Promise<DailyFeedbackRecord> {
  const adjustmentRows = await listAdjustments(row.id);
  const analysis = parseJson<Omit<FeedbackAIAnalysis, "adjustments">>(row.aiSummaryJson, {
    headline: "反馈已保存",
    todaySummary: "暂时无法读取这份反馈的分析内容。",
    planActualDeviation: "未记录",
    deviationReasons: [],
    weakKnowledgePoints: [],
    tomorrowRisks: [],
    recommendations: [],
    generatedAt: new Date(row.updatedAt).toISOString(),
    model: row.model,
  });
  return {
    id: row.id,
    date: row.feedbackDate,
    status: row.status,
    basePlanId: row.basePlanId,
    basePlanVersion: adjustmentRows.length
      ? parseJson<StoredBefore>(adjustmentRows[0].beforeJson, {
          label: "",
          task: null,
          basePlanVersion: null,
        }).basePlanVersion
      : null,
    answers: rowAnswers(row),
    analysis: {
      ...analysis,
      model: analysis.model ?? row.model,
      adjustments: adjustmentRows.map(hydrateAdjustment),
    },
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

const FEEDBACK_SELECT = `SELECT
  id,
  feedback_date AS feedbackDate,
  status,
  base_plan_id AS basePlanId,
  base_plan_updated_at AS basePlanUpdatedAt,
  energy_level AS energyLevel,
  focus_level AS focusLevel,
  actual_study_minutes AS actualStudyMinutes,
  quick_selections_json AS quickSelectionsJson,
  difficulty_notes AS difficultyNotes,
  incomplete_reason AS incompleteReason,
  unclear_knowledge AS unclearKnowledge,
  tomorrow_changes AS tomorrowChanges,
  tomorrow_priority AS tomorrowPriority,
  additional_notes AS additionalNotes,
  system_context_json AS systemContextJson,
  ai_summary_json AS aiSummaryJson,
  model,
  created_at AS createdAt,
  updated_at AS updatedAt
FROM daily_feedbacks`;

async function getFeedbackRow(userId: string, date: string) {
  await ensureAuthSchema();
  return getD1()
    .prepare(`${FEEDBACK_SELECT} WHERE user_id = ? AND feedback_date = ? LIMIT 1`)
    .bind(userId, date)
    .first<DailyFeedbackRow>();
}

export async function getDailyFeedback(userId: string, date: string) {
  const row = await getFeedbackRow(userId, date);
  return row ? hydrateFeedback(row) : null;
}

async function listFeedbackHistory(userId: string): Promise<FeedbackHistoryItem[]> {
  await ensureAuthSchema();
  const result = await getD1()
    .prepare(`SELECT
      feedback.id,
      feedback.feedback_date AS feedbackDate,
      feedback.ai_summary_json AS aiSummaryJson,
      feedback.system_context_json AS systemContextJson,
      COUNT(adjustment.id) AS adjustmentCount,
      SUM(CASE WHEN adjustment.decision = 'accepted' THEN 1 ELSE 0 END) AS acceptedCount
    FROM daily_feedbacks AS feedback
    LEFT JOIN feedback_adjustments AS adjustment ON adjustment.feedback_id = feedback.id
    WHERE feedback.user_id = ?
    GROUP BY feedback.id
    ORDER BY feedback.feedback_date DESC
    LIMIT 14`)
    .bind(userId)
    .all<{
      id: string;
      feedbackDate: string;
      aiSummaryJson: string;
      systemContextJson: string;
      adjustmentCount: number;
      acceptedCount: number | null;
    }>();
  const rows = (result.results ?? []) as Array<{
    id: string;
    feedbackDate: string;
    aiSummaryJson: string;
    systemContextJson: string;
    adjustmentCount: number;
    acceptedCount: number | null;
  }>;
  return rows.map((row) => {
    const analysis = parseJson<Partial<FeedbackAIAnalysis>>(row.aiSummaryJson, {});
    const context = parseJson<Partial<FeedbackSystemContext>>(row.systemContextJson, {});
    return {
      id: row.id,
      date: row.feedbackDate,
      headline: analysis.headline ?? "每日反馈",
      completionPercent: context.todo?.completionPercent ?? null,
      adjustmentCount: row.adjustmentCount,
      acceptedAdjustmentCount: row.acceptedCount ?? 0,
    };
  });
}

export async function getFeedbackPageSnapshot(
  userId: string,
  date = getShanghaiDateKey(),
): Promise<FeedbackPageSnapshot> {
  if (!isValidFeedbackDate(date)) throw new Error("FEEDBACK_DATE_INVALID");
  await ensureAuthSchema();
  const [row, history] = await Promise.all([
    getFeedbackRow(userId, date),
    listFeedbackHistory(userId),
  ]);
  const storedContext = row
    ? parseJson<FeedbackSystemContext | null>(row.systemContextJson, null)
    : null;
  const [context, feedback] = await Promise.all([
    storedContext
      ? Promise.resolve(storedContext)
      : buildFeedbackSystemContext(userId, date),
    row ? hydrateFeedback(row) : Promise.resolve(null),
  ] as const);
  return {
    date,
    isToday: date === getShanghaiDateKey(),
    context,
    feedback,
    history,
  };
}

export async function saveDailyFeedback({
  userId,
  answers,
  context,
  analysis,
  model,
  plan,
}: {
  userId: string;
  answers: DailyFeedbackAnswers;
  context: FeedbackSystemContext;
  analysis: FeedbackAIAnalysis;
  model: string;
  plan: StoredStudyPlan | null;
}) {
  await ensureAuthSchema();
  const d1 = getD1();
  const existing = await getFeedbackRow(userId, answers.feedbackDate);
  const latestPlan = await getLatestStudyPlan(userId);
  if ((plan && (!latestPlan || latestPlan.id !== plan.id || latestPlan.updatedAt !== plan.updatedAt)) ||
    (!plan && latestPlan)) {
    throw new Error("FEEDBACK_PLAN_CHANGED");
  }
  const feedbackId = existing?.id ?? crypto.randomUUID();
  const now = Date.now();
  const proposals = analysis.adjustments;
  const status: DailyFeedbackStatus = proposals.length ? "awaiting_confirmation" : "completed";
  const storedAnalysis = { ...analysis, adjustments: [] };
  const statements = [
    d1.prepare(`INSERT INTO daily_feedbacks (
      id, user_id, feedback_date, status, base_plan_id, base_plan_updated_at,
      energy_level, focus_level, actual_study_minutes, quick_selections_json,
      difficulty_notes, incomplete_reason, unclear_knowledge, tomorrow_changes,
      tomorrow_priority, additional_notes, system_context_json, ai_summary_json,
      model, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, feedback_date) DO UPDATE SET
      status = excluded.status,
      base_plan_id = excluded.base_plan_id,
      base_plan_updated_at = excluded.base_plan_updated_at,
      energy_level = excluded.energy_level,
      focus_level = excluded.focus_level,
      actual_study_minutes = excluded.actual_study_minutes,
      quick_selections_json = excluded.quick_selections_json,
      difficulty_notes = excluded.difficulty_notes,
      incomplete_reason = excluded.incomplete_reason,
      unclear_knowledge = excluded.unclear_knowledge,
      tomorrow_changes = excluded.tomorrow_changes,
      tomorrow_priority = excluded.tomorrow_priority,
      additional_notes = excluded.additional_notes,
      system_context_json = excluded.system_context_json,
      ai_summary_json = excluded.ai_summary_json,
      model = excluded.model,
      updated_at = excluded.updated_at`)
      .bind(
        feedbackId,
        userId,
        answers.feedbackDate,
        status,
        plan?.id ?? null,
        plan?.updatedAt ?? null,
        answers.energyLevel,
        answers.focusLevel,
        answers.actualStudyMinutes,
        JSON.stringify(answers.quickSelections),
        answers.difficultyNotes,
        answers.incompleteReason,
        answers.unclearKnowledge,
        answers.tomorrowChanges,
        answers.tomorrowPriority,
        answers.additionalNotes,
        JSON.stringify(context),
        JSON.stringify(storedAnalysis),
        model,
        existing?.createdAt ?? now,
        now,
      ),
    d1.prepare(`DELETE FROM feedback_adjustments
      WHERE feedback_id = ? AND decision IN ('pending', 'rejected')`).bind(feedbackId),
  ];

  for (const proposal of proposals) {
    const target = proposal.targetTaskId
      ? plan?.plan.tasks.find((task) => task.id === proposal.targetTaskId) ?? null
      : null;
    const before: StoredBefore = {
      label: proposal.before,
      task: target,
      basePlanVersion: plan?.plan.version ?? null,
    };
    const after: StoredAfter = {
      label: proposal.after,
      payload: proposal.payload ?? {},
    };
    statements.push(
      d1.prepare(`INSERT INTO feedback_adjustments (
        id, feedback_id, user_id, base_plan_id, base_plan_updated_at, operation,
        task_id, title, description, reason, before_json, after_json, decision,
        decided_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`)
        .bind(
          proposal.id,
          feedbackId,
          userId,
          plan?.id ?? null,
          plan?.updatedAt ?? null,
          proposal.operation,
          proposal.targetTaskId ?? null,
          proposal.title,
          proposal.description,
          proposal.reason,
          JSON.stringify(before),
          JSON.stringify(after),
          now,
        ),
    );
  }

  await d1.batch(statements);
  await refreshFeedbackStatus(feedbackId);
  const saved = await getFeedbackRow(userId, answers.feedbackDate);
  if (!saved) throw new Error("FEEDBACK_SAVE_FAILED");
  return hydrateFeedback(saved);
}

async function getAdjustmentRow(userId: string, adjustmentId: string) {
  return getD1()
    .prepare(`SELECT
      id,
      feedback_id AS feedbackId,
      base_plan_id AS basePlanId,
      base_plan_updated_at AS basePlanUpdatedAt,
      operation,
      task_id AS taskId,
      title,
      description,
      reason,
      before_json AS beforeJson,
      after_json AS afterJson,
      decision,
      decided_at AS decidedAt,
      created_at AS createdAt
    FROM feedback_adjustments
    WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(adjustmentId, userId)
    .first<AdjustmentRow>();
}

async function refreshFeedbackStatus(feedbackId: string) {
  const counts = await getD1()
    .prepare(`SELECT
      SUM(CASE WHEN decision = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
      SUM(CASE WHEN decision = 'accepted' THEN 1 ELSE 0 END) AS acceptedCount
    FROM feedback_adjustments WHERE feedback_id = ?`)
    .bind(feedbackId)
    .first<{ pendingCount: number | null; acceptedCount: number | null }>();
  const pending = counts?.pendingCount ?? 0;
  const accepted = counts?.acceptedCount ?? 0;
  const status: DailyFeedbackStatus = pending
    ? accepted ? "partially_applied" : "awaiting_confirmation"
    : "completed";
  await getD1()
    .prepare("UPDATE daily_feedbacks SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, Date.now(), feedbackId)
    .run();
}

export async function decideFeedbackAdjustment({
  userId,
  adjustmentId,
  decision,
}: {
  userId: string;
  adjustmentId: string;
  decision: "accepted" | "rejected";
}) {
  await ensureAuthSchema();
  let row = await getAdjustmentRow(userId, adjustmentId);
  if (!row) throw new Error("FEEDBACK_ADJUSTMENT_NOT_FOUND");
  if (row.decision === "accepted" || row.decision === "rejected") {
    if (row.decision !== decision) throw new Error("FEEDBACK_ADJUSTMENT_FINALIZED");
    return {
      adjustment: hydrateAdjustment(row),
      plan: row.decision === "accepted"
        ? await getStudyPlanById(userId, `feedback-adjustment-${row.id}`)
        : await getLatestStudyPlan(userId),
      alreadyDecided: true,
    };
  }

  if (decision === "rejected") {
    if (row.decision === "applying") throw new Error("FEEDBACK_ADJUSTMENT_FINALIZED");
    const decidedAt = Date.now();
    const rejected = await getD1()
      .prepare(`UPDATE feedback_adjustments
        SET decision = 'rejected', decided_at = ?
        WHERE id = ? AND user_id = ? AND decision = 'pending'`)
      .bind(decidedAt, adjustmentId, userId)
      .run();
    row = await getAdjustmentRow(userId, adjustmentId);
    if (!row) throw new Error("FEEDBACK_ADJUSTMENT_NOT_FOUND");
    if (row.decision !== "rejected") throw new Error("FEEDBACK_ADJUSTMENT_FINALIZED");
    await refreshFeedbackStatus(row.feedbackId);
    return {
      adjustment: hydrateAdjustment(row),
      plan: await getLatestStudyPlan(userId),
      alreadyDecided: (rejected.meta?.changes ?? 0) === 0,
    };
  }

  if (row.decision === "pending") {
    const claimed = await getD1()
      .prepare(`UPDATE feedback_adjustments
        SET decision = 'applying'
        WHERE id = ? AND user_id = ? AND decision = 'pending'`)
      .bind(adjustmentId, userId)
      .run();
    if ((claimed.meta?.changes ?? 0) === 0) {
      row = await getAdjustmentRow(userId, adjustmentId);
      if (!row) throw new Error("FEEDBACK_ADJUSTMENT_NOT_FOUND");
      if (row.decision === "accepted") {
        return {
          adjustment: hydrateAdjustment(row),
          plan: await getStudyPlanById(userId, `feedback-adjustment-${row.id}`),
          alreadyDecided: true,
        };
      }
      if (row.decision !== "applying") throw new Error("FEEDBACK_ADJUSTMENT_FINALIZED");
    } else {
      row = { ...row, decision: "applying" };
    }
  }

  const before = parseJson<StoredBefore>(row.beforeJson, {
    label: "",
    task: null,
    basePlanVersion: null,
  });
  const after = parseJson<StoredAfter>(row.afterJson, { label: "", payload: {} });
  let plan;
  try {
    plan = await applyFeedbackAdjustment({
      userId,
      adjustmentId: row.id,
      basePlanId: row.basePlanId,
      basePlanUpdatedAt: row.basePlanUpdatedAt,
      operation: row.operation,
      taskId: row.taskId,
      payload: after.payload,
      title: row.title,
      reason: row.reason,
      expectedTask: before.task,
    });
  } catch (error) {
    await getD1()
      .prepare(`UPDATE feedback_adjustments
        SET decision = 'pending'
        WHERE id = ? AND user_id = ? AND decision = 'applying'`)
      .bind(adjustmentId, userId)
      .run();
    throw error;
  }

  const decidedAt = Date.now();
  const accepted = await getD1()
    .prepare(`UPDATE feedback_adjustments
      SET decision = 'accepted', decided_at = ?
      WHERE id = ? AND user_id = ? AND decision = 'applying'`)
    .bind(decidedAt, adjustmentId, userId)
    .run();
  await refreshFeedbackStatus(row.feedbackId);
  const updated = await getAdjustmentRow(userId, adjustmentId);
  if (!updated) throw new Error("FEEDBACK_ADJUSTMENT_NOT_FOUND");
  return {
    adjustment: hydrateAdjustment(updated),
    plan,
    alreadyDecided: (accepted.meta?.changes ?? 0) === 0,
  };
}

export async function getHomeSummarySlice(userId: string): Promise<HomeSummarySlice> {
  const today = getShanghaiDateKey();
  const feedback = await getDailyFeedback(userId, today);
  if (!feedback) {
    return {
      feedback: {
        status: "pending",
        title: "完成今日反馈总结",
        description: "告诉 AI 今天的真实情况，系统会先生成调整建议，确认后才修改计划。",
        dueLabel: "建议睡前完成",
        questionsRemaining: 5,
      },
    };
  }
  const pendingCount = feedback.analysis.adjustments.filter(
    (item) => item.decision === "pending",
  ).length;
  return {
    feedback: pendingCount
      ? {
          status: "pending",
          title: `${pendingCount} 项计划调整待确认`,
          description: feedback.analysis.headline,
          dueLabel: "确认后同步 Timeline",
          questionsRemaining: 0,
        }
      : {
          status: "completed",
          title: "今日反馈已完成",
          description: feedback.analysis.headline,
          dueLabel: "已保存",
          questionsRemaining: 0,
        },
  };
}
