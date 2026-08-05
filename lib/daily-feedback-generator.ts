import "server-only";

import type {
  DailyFeedbackAnswers,
  FeedbackAIAnalysis,
  FeedbackAdjustment,
  FeedbackAdjustmentOperation,
  FeedbackSystemContext,
} from "../features/summary/summary-types";
import type { StoredStudyPlan, StudyPlanTask } from "./study-plan/types";
import { parsePlanHardConstraints } from "./study-plan/constraints";
import { requestOpenAIStructuredResponse } from "./openai";

type AIAdjustment = {
  operation: FeedbackAdjustmentOperation;
  targetTaskId: string | null;
  title: string;
  description: string;
  reason: string;
  date: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  subject: string | null;
  knowledgePoint: string | null;
};

type AIAnalysisOutput = {
  headline: string;
  todaySummary: string;
  planActualDeviation: string;
  deviationReasons: string[];
  weakKnowledgePoints: string[];
  tomorrowRisks: string[];
  recommendations: string[];
  adjustments: AIAdjustment[];
};

export const DAILY_FEEDBACK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "todaySummary",
    "planActualDeviation",
    "deviationReasons",
    "weakKnowledgePoints",
    "tomorrowRisks",
    "recommendations",
    "adjustments",
  ],
  properties: {
    headline: { type: "string", maxLength: 80 },
    todaySummary: { type: "string", maxLength: 500 },
    planActualDeviation: { type: "string", maxLength: 400 },
    deviationReasons: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 160 },
    },
    weakKnowledgePoints: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 100 },
    },
    tomorrowRisks: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 160 },
    },
    recommendations: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 180 },
    },
    adjustments: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "operation",
          "targetTaskId",
          "title",
          "description",
          "reason",
          "date",
          "startTime",
          "durationMinutes",
          "subject",
          "knowledgePoint",
        ],
        properties: {
          operation: {
            type: "string",
            enum: ["move_task", "split_task", "shorten_task", "add_practice"],
          },
          targetTaskId: { type: ["string", "null"] },
          title: { type: "string", maxLength: 100 },
          description: { type: "string", maxLength: 240 },
          reason: { type: "string", maxLength: 240 },
          date: { type: ["string", "null"] },
          startTime: { type: ["string", "null"] },
          durationMinutes: { type: ["integer", "null"] },
          subject: { type: ["string", "null"] },
          knowledgePoint: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

function validDate(value: string | null, minimum: string, maximum: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= minimum &&
    value <= maximum;
}

function validTime(value: string | null) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

function currentClockInShanghai() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${read("hour")}:${read("minute")}`;
}

function isAdjustable(task: StudyPlanTask | undefined) {
  return Boolean(
    task &&
    !task.locked &&
    (task.status === "pending" || task.status === "delayed"),
  );
}

function beforeLabel(task: StudyPlanTask | null) {
  if (!task) return "当前 Timeline 中没有这项练习";
  return `${task.date} ${task.startTime}–${task.endTime} · ${task.durationMinutes} 分钟`;
}

function afterLabel(adjustment: AIAdjustment, task: StudyPlanTask | null) {
  if (adjustment.operation === "move_task") {
    return `${adjustment.date} ${adjustment.startTime} 开始 · ${task?.durationMinutes ?? adjustment.durationMinutes ?? 0} 分钟`;
  }
  if (adjustment.operation === "split_task") {
    const first = task ? Math.ceil(task.durationMinutes / 2) : 0;
    const second = task ? task.durationMinutes - first : 0;
    return `拆成连续的 ${first} 分钟和 ${second} 分钟两项任务`;
  }
  if (adjustment.operation === "shorten_task") {
    return `保留原开始时间，缩短为 ${adjustment.durationMinutes} 分钟`;
  }
  return `${adjustment.date} ${adjustment.startTime} 新增 ${adjustment.durationMinutes} 分钟练习`;
}

function sanitizeAdjustments(
  suggestions: AIAdjustment[],
  plan: StoredStudyPlan | null,
  date: string,
): FeedbackAdjustment[] {
  if (!plan) return [];
  if (parsePlanHardConstraints(plan.input).unparsedLines.length) return [];
  const tasks = new Map(plan.plan.tasks.map((task) => [task.id, task]));
  const subjects = new Set(plan.plan.tasks.map((task) => task.subject));
  const seenTargets = new Set<string>();
  const result: FeedbackAdjustment[] = [];
  const currentClock = currentClockInShanghai();

  for (const suggestion of suggestions.slice(0, 6)) {
    const target = suggestion.targetTaskId
      ? tasks.get(suggestion.targetTaskId) ?? null
      : null;
    if (suggestion.operation !== "add_practice") {
      if (!target || !isAdjustable(target) || seenTargets.has(target.id)) continue;
      if (suggestion.operation !== "move_task" && target.date < date) continue;
      if (suggestion.operation !== "move_task" &&
        target.date === date &&
        target.startTime <= currentClock) continue;
      if (suggestion.operation === "split_task" && target.durationMinutes < 40) continue;
      if (suggestion.operation === "shorten_task" &&
        (!Number.isInteger(suggestion.durationMinutes) ||
          suggestion.durationMinutes! < 20 ||
          suggestion.durationMinutes! >= target.durationMinutes)) continue;
      if (suggestion.operation === "move_task" &&
        (!validDate(suggestion.date, date, plan.plan.examDate) || !validTime(suggestion.startTime))) continue;
      seenTargets.add(target.id);
    } else {
      if (!validDate(suggestion.date, date, plan.plan.examDate) ||
        !validTime(suggestion.startTime) ||
        !Number.isInteger(suggestion.durationMinutes) ||
        suggestion.durationMinutes! < 20 ||
        suggestion.durationMinutes! > 120 ||
        !suggestion.subject ||
        !subjects.has(suggestion.subject) ||
        !suggestion.knowledgePoint?.trim()) continue;
    }

    result.push({
      id: crypto.randomUUID(),
      targetTaskId: target?.id ?? null,
      basePlanId: plan.id,
      basePlanVersion: plan.plan.version,
      operation: suggestion.operation,
      title: suggestion.title.trim(),
      description: suggestion.description.trim(),
      reason: suggestion.reason.trim(),
      before: beforeLabel(target),
      after: afterLabel(suggestion, target),
      decision: "pending",
      payload: {
        targetTaskId: target?.id ?? null,
        date: suggestion.date,
        startTime: suggestion.startTime,
        durationMinutes: suggestion.durationMinutes,
        subject: suggestion.subject,
        knowledgePoint: suggestion.knowledgePoint,
      },
    });
  }
  return result;
}

function buildInstructions() {
  return `你是“知序”考前学习任务设计器的每日反馈分析师。学生每天把真实情况汇报给你，你需要先区分系统事实、学生补充和推断，再给出可执行建议。

必须遵守：
1. 使用简体中文。只使用输入 JSON 中的真实数据，绝不虚构任务、任务 ID、日期、时长、AI Tutor 使用或日志。
2. 系统已经提供 Todo、完成时长估算、延期/跳过、AI Tutor、日志和剩余 Timeline，不要要求学生重复填写。
3. completedMinutesEstimate 只是“按已完成任务计划时长估算”，绝不能称为实际学习时长；actualStudyMinutes 为 null 时必须明确写“实际用时未记录”。
4. 调整只能是待确认建议，不能声称已经修改 Timeline 或 Todo。
5. 只能调整 status 为 pending/delayed 且 locked=false 的输入任务。不能更改 completed/in_progress/cancelled/locked 任务。
6. operation 规则：move_task 需要真实 targetTaskId/date/startTime；split_task 只用于至少 40 分钟的真实任务；shorten_task 需要 20 分钟以上且小于原时长；add_practice 需要 date/startTime/durationMinutes/subject/knowledgePoint。
7. 同一目标任务最多提出一种调整。建议日期不得晚于考试日期，避免与输入的现有任务时间重叠，保留睡眠和固定安排等硬边界。
8. 如果没有足够证据，不要生成调整项；空数组优于猜测。

输出重点：今天发生了什么、计划与实际偏差、原因、薄弱点、明日风险、推荐方案，以及逐条 Timeline 修改草案。`;
}

export async function generateDailyFeedbackAnalysis({
  userId,
  answers,
  context,
  plan,
}: {
  userId: string;
  answers: DailyFeedbackAnswers;
  context: FeedbackSystemContext;
  plan: StoredStudyPlan | null;
}) {
  const planContext = plan
    ? {
        id: plan.id,
        version: plan.plan.version,
        examName: plan.plan.examName,
        examDate: plan.plan.examDate,
        constraints: {
          unavailableWindows: plan.input.unavailableWindows,
          fixedCommitments: plan.input.fixedCommitments,
          mustKeepBoundaries: plan.input.mustKeepBoundaries,
        },
        preferredStartTime: plan.input.preferredStartTime,
        dailyAvailableMinutes: plan.input.dailyAvailableMinutes,
        tasks: plan.plan.tasks.map((task) => ({
          id: task.id,
          date: task.date,
          startTime: task.startTime,
          endTime: task.endTime,
          durationMinutes: task.durationMinutes,
          subject: task.subject,
          title: task.title,
          knowledgePoints: task.knowledgePoints,
          status: task.status,
          locked: task.locked,
          dependencies: task.dependencies,
        })),
      }
    : null;
  const response = await requestOpenAIStructuredResponse<AIAnalysisOutput>({
    userId,
    instructions: buildInstructions(),
    message: JSON.stringify({
      feedbackDate: answers.feedbackDate,
      systemKnownContext: context,
      studentAnswers: answers,
      authoritativeTimeline: planContext,
    }),
    schemaName: "daily_feedback_analysis",
    schema: DAILY_FEEDBACK_JSON_SCHEMA as Record<string, unknown>,
    maxOutputTokens: 3_600,
  });
  const generatedAt = new Date().toISOString();
  const analysis: FeedbackAIAnalysis = {
    headline: response.data.headline.trim(),
    todaySummary: response.data.todaySummary.trim(),
    planActualDeviation: response.data.planActualDeviation.trim(),
    deviationReasons: response.data.deviationReasons.map((item) => item.trim()).filter(Boolean),
    weakKnowledgePoints: response.data.weakKnowledgePoints.map((item) => item.trim()).filter(Boolean),
    tomorrowRisks: response.data.tomorrowRisks.map((item) => item.trim()).filter(Boolean),
    recommendations: response.data.recommendations.map((item) => item.trim()).filter(Boolean),
    adjustments: sanitizeAdjustments(
      response.data.adjustments,
      plan,
      answers.feedbackDate,
    ),
    generatedAt,
    model: response.model,
  };
  return { analysis, model: response.model };
}
