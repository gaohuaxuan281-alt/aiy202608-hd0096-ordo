import "server-only";

import {
  SUBJECTS,
  isSubjectCode,
  type SubjectCode,
} from "../config/learning-catalog";
import { getD1 } from "../db";
import { ensureAuthSchema } from "./auth";
import { createLearningPlanFingerprint } from "./diagnostic-quiz";
import { getDaysUntilExam } from "./exam-plan";
import { getLearningProfile, type LearningProfile } from "./learning-profile";
import { getLatestStudyPlan } from "./study-plan/store";
import type { StoredStudyPlan, StudyPlanTaskStatus } from "./study-plan/types";

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function shanghaiDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function startOfShanghaiDay(dateKey: string) {
  return Date.parse(`${dateKey}T00:00:00+08:00`);
}

function isCompleted(status: StudyPlanTaskStatus) {
  return status === "completed";
}

function isDelayed(status: StudyPlanTaskStatus) {
  return status === "delayed";
}

function isCancelled(status: StudyPlanTaskStatus) {
  return status === "cancelled";
}

function safePercentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return "0 分钟";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

function formatTimestamp(ms: number | null) {
  if (!ms) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

const subjectByLabel = new Map<string, SubjectCode>(
  (Object.keys(SUBJECTS) as SubjectCode[]).map((subject) => [
    SUBJECTS[subject].label,
    subject,
  ]),
);

const subjectAliases = new Map<string, SubjectCode>([
  ["政治", "politics"],
  ["思政", "politics"],
  ["思想政治", "politics"],
  ["道法", "moral"],
  ["思想品德", "moral"],
  ["道德与法治", "moral"],
]);

/**
 * Older Timeline documents store SubjectCode while newer generated plans may
 * store the visible Chinese label. Insights accepts both without rewriting the
 * authoritative Timeline document.
 */
function normalizeSubject(value: string): SubjectCode | null {
  const normalized = value.trim();
  if (isSubjectCode(normalized)) return normalized;
  return subjectByLabel.get(normalized) ?? subjectAliases.get(normalized) ?? null;
}

function planMatchesLearningProfile(
  plan: StoredStudyPlan,
  profile: LearningProfile,
) {
  return Boolean(
    plan.input.learningProfileFingerprint &&
    plan.input.learningProfileFingerprint === createLearningPlanFingerprint(profile),
  );
}

function planDateRange(plan: StoredStudyPlan | null, todayKey: string) {
  const dates = (plan?.plan.tasks ?? [])
    .map((task) => task.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .toSorted();
  if (dates.length === 0) return null;
  const startDate = dates[0];
  const endDate = dates[dates.length - 1] < todayKey
    ? dates[dates.length - 1]
    : todayKey;
  return startDate <= endDate ? { startDate, endDate } : null;
}

function formatDateRange(range: { startDate: string; endDate: string } | null) {
  if (!range) return null;
  const display = (dateKey: string) => {
    const [, month, day] = dateKey.split("-");
    return `${Number(month)}月${Number(day)}日`;
  };
  return range.startDate === range.endDate
    ? display(range.startDate)
    : `${display(range.startDate)}–${display(range.endDate)}`;
}

type SubjectAgg = {
  subject: SubjectCode;
  subjectLabel: string;
  total: number;
  completed: number;
  delayed: number;
  cancelled: number;
  plannedMinutes: number;
  completedPlannedMinutes: number;
};

function emptySubjectAgg(subject: SubjectCode): SubjectAgg {
  return {
    subject,
    subjectLabel: SUBJECTS[subject].label,
    total: 0,
    completed: 0,
    delayed: 0,
    cancelled: 0,
    plannedMinutes: 0,
    completedPlannedMinutes: 0,
  };
}

type CountRow = { count: number | null };
type AiTutorRow = {
  conversations: number | null;
  messages: number | null;
  lastUsedAt: number | null;
};
type FeedbackStatsRow = {
  total: number | null;
  lastSevenDays: number | null;
  actualMinutes: number | null;
  recordedActualDays: number | null;
};

async function getAiTutorUsage(userId: string) {
  const row = await getD1()
    .prepare(`SELECT
        COUNT(DISTINCT c.id) AS conversations,
        COUNT(m.id) AS messages,
        MAX(m.created_at) AS lastUsedAt
      FROM ai_conversations c
      LEFT JOIN ai_messages m ON m.conversation_id = c.id
      WHERE c.user_id = ? AND c.module = 'ai-tutor'`)
    .bind(userId)
    .first<AiTutorRow>();

  return {
    conversations: row?.conversations ?? 0,
    messages: row?.messages ?? 0,
    lastUsedAt: row?.lastUsedAt ?? null,
  };
}

async function getRecentJournalCount(
  userId: string,
  actions: readonly string[],
  sinceMs: number,
) {
  if (actions.length === 0) return 0;
  const placeholders = actions.map(() => "?").join(",");
  const row = await getD1()
    .prepare(`SELECT COUNT(*) AS count
      FROM journal_entries
      WHERE user_id = ? AND occurred_at >= ? AND action IN (${placeholders})`)
    .bind(userId, sinceMs, ...actions)
    .first<CountRow>();
  return row?.count ?? 0;
}

async function getTotalJournalCount(userId: string, actions: readonly string[]) {
  if (actions.length === 0) return 0;
  const placeholders = actions.map(() => "?").join(",");
  const row = await getD1()
    .prepare(`SELECT COUNT(*) AS count
      FROM journal_entries
      WHERE user_id = ? AND action IN (${placeholders})`)
    .bind(userId, ...actions)
    .first<CountRow>();
  return row?.count ?? 0;
}

async function getFeedbackStats(
  userId: string,
  weekStartKey: string,
  todayKey: string,
  planRange: { startDate: string; endDate: string } | null,
) {
  const row = await getD1()
    .prepare(`SELECT
        COUNT(*) AS total,
        SUM(CASE
          WHEN feedback_date >= ? AND feedback_date <= ? THEN 1
          ELSE 0
        END) AS lastSevenDays,
        COALESCE(SUM(CASE
          WHEN ? IS NOT NULL AND ? IS NOT NULL
            AND feedback_date >= ? AND feedback_date <= ?
          THEN actual_study_minutes
          ELSE 0
        END), 0) AS actualMinutes,
        SUM(CASE
          WHEN ? IS NOT NULL AND ? IS NOT NULL
            AND feedback_date >= ? AND feedback_date <= ?
            AND actual_study_minutes IS NOT NULL
          THEN 1
          ELSE 0
        END) AS recordedActualDays
      FROM daily_feedbacks
      WHERE user_id = ?`)
    .bind(
      weekStartKey,
      todayKey,
      planRange?.startDate ?? null,
      planRange?.endDate ?? null,
      planRange?.startDate ?? null,
      planRange?.endDate ?? null,
      planRange?.startDate ?? null,
      planRange?.endDate ?? null,
      planRange?.startDate ?? null,
      planRange?.endDate ?? null,
      userId,
    )
    .first<FeedbackStatsRow>();

  return {
    total: row?.total ?? 0,
    lastSevenDays: row?.lastSevenDays ?? 0,
    actualMinutes: row?.actualMinutes ?? 0,
    recordedActualDays: row?.recordedActualDays ?? 0,
  };
}

type QuizSubjectBreakdown = {
  attemptId: string;
  completedAt: number;
  subjectStats: Map<SubjectCode, { correct: number; total: number }>;
};

async function getRecentCompletedQuizBreakdowns(
  userId: string,
  profileFingerprint: string | null,
  limit = 2,
): Promise<QuizSubjectBreakdown[]> {
  if (!profileFingerprint) return [];
  const attempts = await getD1()
    .prepare(`SELECT id, completed_at AS completedAt
      FROM diagnostic_quiz_attempts
      WHERE user_id = ? AND profile_fingerprint = ?
        AND status = 'completed' AND completed_at IS NOT NULL
      ORDER BY completed_at DESC, created_at DESC, id DESC
      LIMIT ?`)
    .bind(userId, profileFingerprint, limit)
    .all<{ id: string; completedAt: number }>();

  const rows = attempts.results ?? [];
  if (rows.length === 0) return [];

  const breakdowns: QuizSubjectBreakdown[] = [];
  for (const attempt of rows) {
    const stats = new Map<SubjectCode, { correct: number; total: number }>();
    const answers = await getD1()
      .prepare(`SELECT
          q.subject,
          a.is_correct AS isCorrect
        FROM diagnostic_quiz_questions q
        INNER JOIN diagnostic_quiz_answers a
          ON a.attempt_id = q.attempt_id AND a.question_id = q.id
        WHERE q.attempt_id = ?`)
      .bind(attempt.id)
      .all<{ subject: string; isCorrect: number }>();

    for (const answer of answers.results ?? []) {
      const subject = normalizeSubject(answer.subject);
      if (!subject) continue;
      const stat = stats.get(subject) ?? { correct: 0, total: 0 };
      stat.total += 1;
      if (answer.isCorrect) stat.correct += 1;
      stats.set(subject, stat);
    }

    breakdowns.push({
      attemptId: attempt.id,
      completedAt: attempt.completedAt,
      subjectStats: stats,
    });
  }
  return breakdowns;
}

function buildImprovingSubjects(breakdowns: QuizSubjectBreakdown[]) {
  if (breakdowns.length < 2) return [];
  const latest = breakdowns[0];
  const previous = breakdowns[1];
  const improving: Array<{
    subject: SubjectCode;
    subjectLabel: string;
    beforePercentage: number;
    afterPercentage: number;
    delta: number;
  }> = [];

  for (const [subject, latestStat] of latest.subjectStats) {
    const previousStat = previous.subjectStats.get(subject);
    if (!previousStat || previousStat.total === 0 || latestStat.total === 0) {
      continue;
    }
    const beforePercentage = safePercentage(
      previousStat.correct,
      previousStat.total,
    );
    const afterPercentage = safePercentage(latestStat.correct, latestStat.total);
    const delta = afterPercentage - beforePercentage;
    if (delta > 0) {
      improving.push({
        subject,
        subjectLabel: SUBJECTS[subject].label,
        beforePercentage,
        afterPercentage,
        delta,
      });
    }
  }

  return improving.sort((left, right) => right.delta - left.delta);
}

function buildPreparationStatus(
  daysLeft: number | null,
  completionPercent: number | null,
) {
  if (daysLeft === null || completionPercent === null) {
    return { label: "尚未生成学习计划", level: "neutral" as const };
  }
  if (daysLeft <= 0) {
    return { label: "考试已到，请冲刺最后复习", level: "risk" as const };
  }
  if (daysLeft <= 14 && completionPercent < 50) {
    return {
      label: `仅剩 ${daysLeft} 天，完成度偏低，建议加速`,
      level: "risk" as const,
    };
  }
  if (completionPercent >= 60) {
    return {
      label: `进度良好，剩余 ${daysLeft} 天稳步推进`,
      level: "good" as const,
    };
  }
  if (completionPercent < 30) {
    return {
      label: `节奏偏慢，剩余 ${daysLeft} 天需要提升强度`,
      level: "warning" as const,
    };
  }
  return {
    label: `进度正常，剩余 ${daysLeft} 天按计划执行`,
    level: "good" as const,
  };
}

export type InsightsSummary = {
  generatedAt: string;
  hasPlan: boolean;
  planNeedsRefresh: boolean;
  exam: {
    examName: string | null;
    examDate: string | null;
    daysLeft: number | null;
  };
  overallCompletion: {
    completed: number;
    total: number;
    percentage: number;
    plannedMinutes: number;
    actualMinutes: number;
    recordedActualDays: number;
    actualRangeLabel: string | null;
    plannedLabel: string;
    actualLabel: string;
  };
  rangeProgress: {
    today: { completed: number; total: number; percentage: number };
    week: { completed: number; total: number; percentage: number };
    cycle: { completed: number; total: number; percentage: number };
  };
  subjectCompletion: Array<{
    subject: SubjectCode;
    subjectLabel: string;
    completed: number;
    total: number;
    percentage: number;
    /** @deprecated Use completedPlannedMinutes; feedback has no per-subject actual split. */
    actualMinutes: number;
    /** @deprecated Use completedPlannedLabel; feedback has no per-subject actual split. */
    actualLabel: string;
    completedPlannedMinutes: number;
    completedPlannedLabel: string;
  }>;
  subjectMastery: Array<{
    subject: SubjectCode;
    subjectLabel: string;
    correct: number;
    total: number;
    percentage: number;
  }>;
  weakTopics: Array<{
    subject: SubjectCode;
    subjectLabel: string;
    unitNumber: number;
    unitLabel: string;
    knowledgePoint: string;
  }>;
  improvingSubjects: Array<{
    subject: SubjectCode;
    subjectLabel: string;
    beforePercentage: number;
    afterPercentage: number;
    delta: number;
  }>;
  taskStats: {
    onTime: number;
    delayed: number;
    cancelled: number;
    onTimePercentage: number;
  };
  planAdjustments: {
    recentCount: number;
    totalCount: number;
  };
  aiTutor: {
    conversations: number;
    messages: number;
    lastUsedAtLabel: string | null;
  };
  feedback: {
    total: number;
    lastSevenDays: number;
  };
  preparationStatus: {
    label: string;
    level: "good" | "warning" | "risk" | "neutral";
  };
};

export async function getInsightsSummary(
  userId: string,
): Promise<InsightsSummary> {
  await ensureAuthSchema();

  const now = new Date();
  const todayKey = shanghaiDateKey(now);
  const weekStartKey = shiftDateKey(todayKey, -6);
  const planAdjustmentActions = [
    "plan_adjusted",
    "adjustment_accepted",
    "adjustment_rejected",
    "correction_recorded",
  ] as const;

  const rawPlanPromise = getLatestStudyPlan(userId);
  const learningProfilePromise = getLearningProfile(userId);
  const aiTutorPromise = getAiTutorUsage(userId);
  const recentPlanAdjustmentsPromise = getRecentJournalCount(
    userId,
    planAdjustmentActions,
    startOfShanghaiDay(weekStartKey),
  );
  const totalPlanAdjustmentsPromise = getTotalJournalCount(
    userId,
    planAdjustmentActions,
  );

  const [rawPlan, learningProfile] = await Promise.all([
    rawPlanPromise,
    learningProfilePromise,
  ]);
  const planIsCurrent = Boolean(
    rawPlan &&
    learningProfile &&
    planMatchesLearningProfile(rawPlan, learningProfile),
  );
  const plan = planIsCurrent ? rawPlan : null;
  const planNeedsRefresh = Boolean(rawPlan && !planIsCurrent);
  const currentPlanRange = planDateRange(plan, todayKey);
  const profileFingerprint = learningProfile
    ? createLearningPlanFingerprint(learningProfile)
    : null;

  const [
    aiTutor,
    recentPlanAdjustments,
    totalPlanAdjustments,
    feedbackStats,
    quizBreakdowns,
  ] = await Promise.all([
    aiTutorPromise,
    recentPlanAdjustmentsPromise,
    totalPlanAdjustmentsPromise,
    getFeedbackStats(userId, weekStartKey, todayKey, currentPlanRange),
    getRecentCompletedQuizBreakdowns(userId, profileFingerprint, 2),
  ] as const);

  const tasks = plan?.plan.tasks ?? [];
  const subjectAggMap = new Map<SubjectCode, SubjectAgg>();
  for (const task of tasks) {
    const subject = normalizeSubject(task.subject);
    if (!subject) continue;
    const aggregate = subjectAggMap.get(subject) ?? emptySubjectAgg(subject);
    aggregate.total += 1;
    aggregate.plannedMinutes += task.durationMinutes;
    if (isCompleted(task.status)) {
      aggregate.completed += 1;
      aggregate.completedPlannedMinutes += task.durationMinutes;
    } else if (isDelayed(task.status)) {
      aggregate.delayed += 1;
    } else if (isCancelled(task.status)) {
      aggregate.cancelled += 1;
    }
    subjectAggMap.set(subject, aggregate);
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => isCompleted(task.status)).length;
  const delayedTasks = tasks.filter((task) => isDelayed(task.status)).length;
  const cancelledTasks = tasks.filter((task) => isCancelled(task.status)).length;
  const plannedMinutes = tasks.reduce(
    (sum, task) => sum + task.durationMinutes,
    0,
  );
  const todayTasks = tasks.filter((task) => task.date === todayKey);
  const weekTasks = tasks.filter(
    (task) => task.date >= weekStartKey && task.date <= todayKey,
  );

  const profileSubjects = learningProfile?.subjects ?? [];
  const subjectCompletion = profileSubjects.map((preference) => {
    const aggregate =
      subjectAggMap.get(preference.subject) ?? emptySubjectAgg(preference.subject);
    const completedPlannedLabel = formatMinutes(
      aggregate.completedPlannedMinutes,
    );
    return {
      subject: preference.subject,
      subjectLabel: SUBJECTS[preference.subject].label,
      completed: aggregate.completed,
      total: aggregate.total,
      percentage: safePercentage(aggregate.completed, aggregate.total),
      // Compatibility aliases for the employee UI. They are planned duration
      // attached to completed tasks, not reported actual study time.
      actualMinutes: aggregate.completedPlannedMinutes,
      actualLabel: completedPlannedLabel,
      completedPlannedMinutes: aggregate.completedPlannedMinutes,
      completedPlannedLabel,
    };
  });

  const latestBreakdown = quizBreakdowns[0];
  const subjectMastery = profileSubjects
    .map((preference) => {
      const stat = latestBreakdown?.subjectStats.get(preference.subject);
      return {
        subject: preference.subject,
        subjectLabel: SUBJECTS[preference.subject].label,
        correct: stat?.correct ?? 0,
        total: stat?.total ?? 0,
        percentage: stat ? safePercentage(stat.correct, stat.total) : 0,
      };
    })
    .filter((item) => item.total > 0);

  const weakTopics: InsightsSummary["weakTopics"] = [];
  if (latestBreakdown) {
    const weakRows = await getD1()
      .prepare(`SELECT
          q.subject,
          q.unit_number AS unitNumber,
          q.knowledge_point AS knowledgePoint,
          a.is_correct AS isCorrect
        FROM diagnostic_quiz_questions q
        INNER JOIN diagnostic_quiz_answers a
          ON a.attempt_id = q.attempt_id AND a.question_id = q.id
        WHERE q.attempt_id = ?`)
      .bind(latestBreakdown.attemptId)
      .all<{
        subject: string;
        unitNumber: number;
        knowledgePoint: string;
        isCorrect: number;
      }>();

    const seen = new Set<string>();
    for (const row of weakRows.results ?? []) {
      const subject = normalizeSubject(row.subject);
      if (!subject || row.isCorrect) continue;
      const key = `${subject}-${row.unitNumber}-${row.knowledgePoint}`;
      if (seen.has(key)) continue;
      seen.add(key);
      weakTopics.push({
        subject,
        subjectLabel: SUBJECTS[subject].label,
        unitNumber: row.unitNumber,
        unitLabel: `第 ${row.unitNumber} 单元`,
        knowledgePoint: row.knowledgePoint,
      });
    }
  }

  const improvingSubjects = buildImprovingSubjects(quizBreakdowns);
  const attemptedTasks = completedTasks + delayedTasks;
  const onTimePercentage = safePercentage(completedTasks, attemptedTasks);
  const examDate = learningProfile?.examDate ?? null;
  const daysLeft = examDate ? getDaysUntilExam(examDate) : null;
  const examName = plan?.plan.examName ?? null;
  const completionPercent = safePercentage(completedTasks, totalTasks);
  const preparationStatus = planNeedsRefresh
    ? {
        label: "学习档案已更新，请重新生成 Timeline",
        level: "warning" as const,
      }
    : buildPreparationStatus(
        daysLeft,
        totalTasks > 0 ? completionPercent : null,
      );

  const todayCompleted = todayTasks.filter((task) =>
    isCompleted(task.status),
  ).length;
  const weekCompleted = weekTasks.filter((task) =>
    isCompleted(task.status),
  ).length;

  return {
    generatedAt: now.toISOString(),
    hasPlan: Boolean(plan),
    planNeedsRefresh,
    exam: { examName, examDate, daysLeft },
    overallCompletion: {
      completed: completedTasks,
      total: totalTasks,
      percentage: completionPercent,
      plannedMinutes,
      actualMinutes: feedbackStats.actualMinutes,
      recordedActualDays: feedbackStats.recordedActualDays,
      actualRangeLabel: formatDateRange(currentPlanRange),
      plannedLabel: formatMinutes(plannedMinutes),
      actualLabel: formatMinutes(feedbackStats.actualMinutes),
    },
    rangeProgress: {
      today: {
        completed: todayCompleted,
        total: todayTasks.length,
        percentage: safePercentage(todayCompleted, todayTasks.length),
      },
      week: {
        completed: weekCompleted,
        total: weekTasks.length,
        percentage: safePercentage(weekCompleted, weekTasks.length),
      },
      cycle: {
        completed: completedTasks,
        total: totalTasks,
        percentage: completionPercent,
      },
    },
    subjectCompletion,
    subjectMastery,
    weakTopics,
    improvingSubjects,
    taskStats: {
      onTime: completedTasks,
      delayed: delayedTasks,
      cancelled: cancelledTasks,
      onTimePercentage,
    },
    planAdjustments: {
      recentCount: recentPlanAdjustments,
      totalCount: totalPlanAdjustments,
    },
    aiTutor: {
      conversations: aiTutor.conversations,
      messages: aiTutor.messages,
      lastUsedAtLabel: formatTimestamp(aiTutor.lastUsedAt),
    },
    feedback: {
      total: feedbackStats.total,
      lastSevenDays: feedbackStats.lastSevenDays,
    },
    preparationStatus,
  };
}
