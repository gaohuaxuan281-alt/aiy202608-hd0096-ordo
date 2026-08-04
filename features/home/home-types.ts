export type HomeTaskStatus = "ready" | "in_progress" | "blocked";
export type HomeRiskLevel = "low" | "medium" | "high";

export type HomeExamOverview = {
  id: string;
  name: string;
  startsAt: string;
  dateLabel: string;
  daysRemaining: number;
  planStatusLabel: string;
};

export type HomeTodayProgress = {
  completedTasks: number;
  totalTasks: number;
  completionPercent: number;
  completedMinutes: number;
  plannedMinutes: number;
  remainingAvailableMinutes: number;
  originalAvailableMinutes: number;
};

export type HomeNextTask = {
  id: string;
  subject: string;
  title: string;
  timeLabel: string;
  durationMinutes: number;
  status: HomeTaskStatus;
  statusLabel: string;
  completionCriteria: string;
  sourceLabel: string;
};

export type HomeRisk = {
  id: string;
  level: HomeRiskLevel;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
};

export type HomePlanChange = {
  id: string;
  happenedAtLabel: string;
  title: string;
  description: string;
  actorLabel: string;
  href: string;
};

export type HomePendingAdjustment = {
  id: string;
  title: string;
  description: string;
  impactLabel: string;
};

export type HomeSubjectProgress = {
  id: string;
  subject: string;
  completionPercent: number;
  completedMinutes: number;
  plannedMinutes: number;
  trendLabel: string;
  riskLabel: string;
  tone: "indigo" | "teal" | "amber" | "rose";
};

export type HomeFeedbackReminder = {
  status: "pending" | "completed";
  title: string;
  description: string;
  dueLabel: string;
  questionsRemaining: number;
};

export type HomeTimelineSlice = {
  exam: HomeExamOverview;
  nextTask: HomeNextTask;
  risk: HomeRisk;
  recentChanges: HomePlanChange[];
  pendingAdjustments: HomePendingAdjustment[];
  weeklyAdjustmentCount: number;
};

export type HomeTodoSlice = {
  today: HomeTodayProgress;
};

export type HomeTutorSlice = {
  quickPrompts: string[];
};

export type HomeSummarySlice = {
  feedback: HomeFeedbackReminder;
};

export type HomeInsightsSlice = {
  subjects: HomeSubjectProgress[];
  overallStatusLabel: string;
};

export type HomeDashboardSnapshot = {
  generatedAt: string;
  dateLabel: string;
  greeting: string;
  timeline: HomeTimelineSlice;
  todo: HomeTodoSlice;
  tutor: HomeTutorSlice;
  summary: HomeSummarySlice;
  insights: HomeInsightsSlice;
};

/**
 * Each employee implements only the slice owned by their module. The homepage
 * consumes these read-only adapters and never writes module business data.
 */
export type HomeDashboardAdapters = {
  timeline: () => Promise<HomeTimelineSlice>;
  todo: () => Promise<HomeTodoSlice>;
  tutor: () => Promise<HomeTutorSlice>;
  summary: () => Promise<HomeSummarySlice>;
  insights: () => Promise<HomeInsightsSlice>;
};
