export type StudyPlanGenerationInput = {
  examName: string;
  examDate: string;
  targetScore: string;
  dailyAvailableMinutes: number;
  preferredStartTime: string;
  unavailableWindows: string;
  fixedCommitments: string;
  mustKeepBoundaries: string;
  focusStrategy: string;
  extraContext: string;
};

export type StudyPlanTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "delayed"
  | "cancelled";

export type StudyPlanTaskPriority = "high" | "medium" | "low";

export type StudyPlanTask = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  subject: string;
  title: string;
  knowledgePoints: string[];
  goal: string;
  completionCriteria: string;
  status: StudyPlanTaskStatus;
  priority: StudyPlanTaskPriority;
  locked: boolean;
  dependencies: string[];
  reason: string;
  source: "ai_generated" | "ai_adjusted";
};

export type StudyPlanRisk = {
  id: string;
  level: "high" | "medium" | "low";
  title: string;
  description: string;
};

export type StudyPlanAdjustment = {
  id: string;
  title: string;
  description: string;
  reason: string;
  impactLabel: string;
};

export type StudyPlanDocument = {
  version: number;
  examName: string;
  examDate: string;
  targetScore: string;
  generatedAt: string;
  summary: string;
  explanation: string;
  assumptions: string[];
  risks: StudyPlanRisk[];
  pendingAdjustments: StudyPlanAdjustment[];
  tasks: StudyPlanTask[];
};

export type StoredStudyPlan = {
  id: string;
  userId: string;
  examName: string;
  examDate: string;
  targetScore: string;
  input: StudyPlanGenerationInput;
  plan: StudyPlanDocument;
  model: string;
  rawResponse: string;
  parentPlanId: string | null;
  sourceAdjustmentId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type TodoTaskSlice = {
  id: string;
  subject: string;
  title: string;
  timeLabel: string;
  durationMinutes: number;
  status: StudyPlanTaskStatus;
  priority: StudyPlanTaskPriority;
  goal: string;
  completionCriteria: string;
  knowledgePoints: string[];
  reason: string;
  source: string;
  dependencies: string[];
  overdue: boolean;
};

export type TodoSnapshot = {
  planId: string;
  examName: string;
  examDate: string;
  generatedAt: string;
  todayKey: string;
  completionPercent: number;
  completedCount: number;
  totalCount: number;
  currentTask: TodoTaskSlice | null;
  nextTask: TodoTaskSlice | null;
  todayTasks: TodoTaskSlice[];
  completedTasks: TodoTaskSlice[];
  overdueTasks: TodoTaskSlice[];
  upcomingTasks: TodoTaskSlice[];
};
