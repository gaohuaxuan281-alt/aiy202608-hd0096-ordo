export type FeedbackAdjustmentDecision = "pending" | "accepted" | "rejected";

export type FeedbackAdjustmentOperation =
  | "move_task"
  | "split_task"
  | "shorten_task"
  | "add_practice";

export type DailyFeedbackStatus =
  | "awaiting_confirmation"
  | "partially_applied"
  | "completed";

export interface FeedbackAdjustmentPayload {
  targetTaskId?: string | null;
  date?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
  subject?: string | null;
  knowledgePoint?: string | null;
}

export interface FeedbackContextTask {
  id: string;
  title: string;
  subject: string;
  date: string;
  timeLabel?: string | null;
  durationMinutes: number;
  status: string;
}

export interface FeedbackContextLog {
  id: string;
  title: string;
  occurredAt: string;
  moduleLabel?: string | null;
}

export interface FeedbackSystemContext {
  date: string;
  todo: {
    hasPlan: boolean;
    totalCount: number;
    completedCount: number;
    completionPercent: number | null;
    plannedMinutes: number;
    completedMinutesEstimate: number;
  };
  delayedTasks: FeedbackContextTask[];
  skippedTasks: FeedbackContextTask[];
  tutor: {
    sessionCount: number;
    messageCount: number;
    lastUsedAt?: string | null;
  };
  journal: {
    count: number;
    highlights: FeedbackContextLog[];
  };
  remainingTimeline: {
    taskCount: number;
    totalMinutes: number;
    tasks: FeedbackContextTask[];
  };
}

export interface DailyFeedbackAnswers {
  feedbackDate: string;
  energyLevel: number;
  focusLevel: number;
  actualStudyMinutes: number | null;
  quickSelections: string[];
  difficultyNotes: string;
  incompleteReason: string;
  unclearKnowledge: string;
  tomorrowChanges: string;
  tomorrowPriority: string;
  additionalNotes: string;
}

export interface FeedbackAdjustment {
  id: string;
  proposalId?: string | null;
  targetTaskId?: string | null;
  basePlanId?: string | null;
  basePlanVersion?: number | null;
  operation: FeedbackAdjustmentOperation;
  title: string;
  description: string;
  reason: string;
  before: string;
  after: string;
  decision: FeedbackAdjustmentDecision;
  decidedAt?: string | null;
  payload?: FeedbackAdjustmentPayload | null;
}

export interface FeedbackAIAnalysis {
  headline: string;
  todaySummary: string;
  planActualDeviation: string;
  deviationReasons: string[];
  weakKnowledgePoints: string[];
  tomorrowRisks: string[];
  recommendations: string[];
  adjustments: FeedbackAdjustment[];
  generatedAt: string;
  model?: string | null;
}

export interface DailyFeedbackRecord {
  id: string;
  date: string;
  status?: DailyFeedbackStatus;
  basePlanId?: string | null;
  basePlanVersion?: number | null;
  answers: DailyFeedbackAnswers;
  analysis: FeedbackAIAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackHistoryItem {
  id: string;
  date: string;
  headline: string;
  completionPercent: number | null;
  adjustmentCount: number;
  acceptedAdjustmentCount: number;
}

export interface FeedbackPageSnapshot {
  date: string;
  isToday: boolean;
  context: FeedbackSystemContext;
  feedback: DailyFeedbackRecord | null;
  history: FeedbackHistoryItem[];
}

export interface FeedbackSnapshotResponse {
  snapshot?: FeedbackPageSnapshot | null;
  error?: string;
}

export interface FeedbackAdjustmentResponse extends FeedbackSnapshotResponse {
  adjustment?: FeedbackAdjustment;
}
