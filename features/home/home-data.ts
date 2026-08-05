import "server-only";

import { SUBJECTS } from "../../config/learning-catalog";
import {
  formatExamDate,
  getDaysUntilExam,
} from "../../lib/exam-plan";
import type { DiagnosticQuizResult } from "../../lib/diagnostic-quiz-types";
import type { LearningProfile } from "../../lib/learning-profile";
import type { JournalEntry } from "../journal/journal-types";
import type {
  HomeDashboardAdapters,
  HomeDashboardSnapshot,
  HomeDiagnosticOverview,
  HomeInsightsSlice,
  HomeSummarySlice,
  HomeTimelineSlice,
  HomeTodoSlice,
  HomeTutorSlice,
} from "./home-types";

export const HOME_DATA_OWNERS = {
  currentExam: "timeline",
  nextTask: "timeline",
  remainingTime: "todo",
  currentRisk: "timeline",
  recentChanges: "journal",
  pendingAdjustments: "timeline",
  todayProgress: "todo",
  subjectProgress: "insights",
  tutorEntry: "ai-tutor",
  feedbackReminder: "summary",
} as const;

function emptyTimeline(): Promise<HomeTimelineSlice> {
  return Promise.resolve({
    exam: null,
    nextTask: null,
    risk: null,
    recentChanges: [],
    pendingAdjustments: [],
    weeklyAdjustmentCount: null,
  });
}

function emptyTodo(): Promise<HomeTodoSlice> {
  return Promise.resolve({ today: null });
}

function defaultTutor(): Promise<HomeTutorSlice> {
  return Promise.resolve({
    quickPrompts: [
      "根据我的考试范围解释一个薄弱知识点",
      "根据诊断结果给我一道针对性练习",
      "帮我规划下一次学习应该先做什么",
    ],
  });
}

function emptySummary(): Promise<HomeSummarySlice> {
  return Promise.resolve({ feedback: null });
}

function emptyInsights(): Promise<HomeInsightsSlice> {
  return Promise.resolve({ subjects: [], overallStatusLabel: null });
}

/**
 * Modules that have not shipped a homepage data adapter return an explicit
 * empty slice. The homepage must never invent business records or metrics.
 */
export const emptyHomeAdapters: HomeDashboardAdapters = {
  timeline: emptyTimeline,
  todo: emptyTodo,
  tutor: defaultTutor,
  summary: emptySummary,
  insights: emptyInsights,
};

function examFromLearningProfile(examPlan: LearningProfile | null): HomeTimelineSlice["exam"] {
  if (!examPlan?.examDate) return null;
  const subjectLabels = examPlan.subjects.map((item) => SUBJECTS[item.subject].label);

  return {
    id: "exam-learning-profile",
    name: subjectLabels.length === 1 ? `${subjectLabels[0]}考试` : `${subjectLabels.join("、")}考试`,
    startsAt: `${examPlan.examDate}T09:00:00+08:00`,
    dateLabel: formatExamDate(examPlan.examDate),
    daysRemaining: getDaysUntilExam(examPlan.examDate),
    planStatusLabel: "考试范围已保存",
  };
}

const journalDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function changesFromJournal(entries: JournalEntry[]): HomeTimelineSlice["recentChanges"] {
  return entries.slice(0, 4).map((entry) => ({
    id: entry.id,
    happenedAtLabel: journalDateFormatter.format(new Date(entry.occurredAt)),
    title: entry.title,
    description: entry.summary,
    actorLabel: `${entry.moduleLabel} · ${entry.actorLabel}`,
    href: entry.relatedObject.href || "/journal",
  }));
}

function diagnosticOverview(result: DiagnosticQuizResult | null): HomeDiagnosticOverview | null {
  if (!result) return null;
  return {
    score: result.score,
    total: result.total,
    percentage: result.percentage,
    completedAtLabel: journalDateFormatter.format(new Date(result.completedAt)),
    subjectScores: result.subjectScores.map((item) => ({
      subject: item.subjectLabel,
      correct: item.correct,
      total: item.total,
      percentage: item.percentage,
    })),
    weakTopics: result.weakTopics.map((item) => ({
      subject: item.subjectLabel,
      unitLabel: item.unitLabel,
      knowledgePoint: item.knowledgePoint,
    })),
  };
}

export async function getHomeDashboardSnapshot(
  {
    adapters = emptyHomeAdapters,
    examPlan = null,
    diagnosticQuiz = null,
    journalEntries = [],
  }: {
    adapters?: HomeDashboardAdapters;
    examPlan?: LearningProfile | null;
    diagnosticQuiz?: DiagnosticQuizResult | null;
    journalEntries?: JournalEntry[];
  } = {},
): Promise<HomeDashboardSnapshot> {
  const [timeline, todo, tutor, summary, insights] = await Promise.all([
    adapters.timeline(),
    adapters.todo(),
    adapters.tutor(),
    adapters.summary(),
    adapters.insights(),
  ]);
  const now = new Date();

  return {
    generatedAt: now.toISOString(),
    dateLabel: new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(now),
    greeting: now.getHours() < 12 ? "早上好" : now.getHours() < 18 ? "下午好" : "晚上好",
    timeline: {
      ...timeline,
      exam: timeline.exam ?? examFromLearningProfile(examPlan),
      recentChanges: timeline.recentChanges.length
        ? timeline.recentChanges
        : changesFromJournal(journalEntries),
    },
    todo,
    tutor,
    summary,
    insights,
    diagnostic: diagnosticOverview(diagnosticQuiz),
  };
}
