import type { LearningProfile } from "../learning-profile";
import type { DiagnosticQuizWeakTopic } from "../diagnostic-quiz-types";
import type { UserProfile } from "../profile-types";
import type {
  StudyPlanAdjustment,
  StudyPlanDocument,
  StudyPlanGenerationInput,
  StudyPlanRisk,
  StudyPlanTask,
} from "./types";

type SubjectDescriptor = {
  subject: string;
  textbook: string;
  examScope: string;
  weakTopics: string[];
};

type RawStudyPlanPayload = {
  summary?: unknown;
  explanation?: unknown;
  assumptions?: unknown;
  risks?: unknown;
  pendingAdjustments?: unknown;
  tasks?: unknown;
};

type RawStudyPlanTaskPayload = {
  dayOffset?: unknown;
  durationMinutes?: unknown;
  subject?: unknown;
  title?: unknown;
  knowledgePoints?: unknown;
  goal?: unknown;
  completionCriteria?: unknown;
  priority?: unknown;
  reason?: unknown;
};

export const TIMELINE_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "explanation", "assumptions", "risks", "pendingAdjustments", "tasks"],
  properties: {
    summary: { type: "string" },
    explanation: { type: "string" },
    assumptions: {
      type: "array",
      items: { type: "string" },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "title", "description"],
        properties: {
          level: { type: "string", enum: ["high", "medium", "low"] },
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    pendingAdjustments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "reason", "impactLabel"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          reason: { type: "string" },
          impactLabel: { type: "string" },
        },
      },
    },
    tasks: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "dayOffset",
          "durationMinutes",
          "subject",
          "title",
          "knowledgePoints",
          "goal",
          "completionCriteria",
          "priority",
          "reason",
        ],
        properties: {
          dayOffset: { type: "integer", enum: [0, 1] },
          durationMinutes: { type: "number" },
          subject: { type: "string" },
          title: { type: "string" },
          knowledgePoints: {
            type: "array",
            items: { type: "string" },
          },
          goal: { type: "string" },
          completionCriteria: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeTime(value: unknown, fallback: string) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function normalizeStatus(value: unknown): StudyPlanTask["status"] {
  return value === "in_progress" ||
      value === "completed" ||
      value === "delayed" ||
      value === "cancelled"
    ? value
    : "pending";
}

function normalizePriority(value: unknown): StudyPlanTask["priority"] {
  return value === "high" || value === "low" ? value : "medium";
}

function sanitizeText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function extractJsonPayload(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  throw new Error("AI 未返回可解析的 JSON 计划。");
}

function sanitizeJsonPayload(raw: string) {
  const normalized = raw
    .replace(/^\uFEFF/, "")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'");

  let result = "";
  let inString = false;
  let escaping = false;

  for (const char of normalized) {
    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaping = true;
      continue;
    }

    if (char === "\"") {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString && (char === "\n" || char === "\r" || char === "\t")) {
      result += char === "\t" ? " " : "\\n";
      continue;
    }

    result += char;
  }

  return result;
}

function parseClockToMinutes(value: string) {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return 19 * 60;
  return Math.min(23 * 60 + 55, Math.max(0, hours * 60 + minutes));
}

function formatMinutesToClock(totalMinutes: number) {
  const normalized = Math.min(23 * 60 + 59, Math.max(0, Math.round(totalMinutes)));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function toDateKey(date: Date) {
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, "0"),
    `${date.getDate()}`.padStart(2, "0"),
  ].join("-");
}

function addDays(baseDate: Date, days: number) {
  const result = new Date(baseDate);
  result.setDate(baseDate.getDate() + days);
  return result;
}

function normalizeDayOffset(value: unknown, fallback: number) {
  return value === 1 ? 1 : value === 0 ? 0 : fallback;
}

function normalizeDurationMinutes(value: unknown, fallback: number) {
  return clampInteger(value, 20, 120, fallback);
}

function allocateDurations(totalMinutes: number, requested: number[]) {
  if (requested.length === 0) return [];
  const minimumPerTask = 20;
  const hardLimit = Math.max(minimumPerTask * requested.length, totalMinutes);
  let remaining = hardLimit;

  return requested.map((value, index) => {
    const tasksLeft = requested.length - index - 1;
    const minimumLeft = tasksLeft * minimumPerTask;
    const maxCurrent = Math.max(minimumPerTask, remaining - minimumLeft);
    const planned = Math.min(maxCurrent, Math.max(minimumPerTask, value));
    remaining -= planned;
    return planned;
  });
}

export function buildTimelineGenerationInstructions({
  displayName,
  userProfile,
  learningProfile,
  subjects,
  input,
  diagnosticWeakTopics,
}: {
  displayName: string;
  userProfile: UserProfile;
  learningProfile: LearningProfile;
  subjects: SubjectDescriptor[];
  input: StudyPlanGenerationInput;
  diagnosticWeakTopics: DiagnosticQuizWeakTopic[];
}) {
  const subjectSummary = subjects
    .map((item) => {
      const weakTopicSummary = item.weakTopics.length ? `；优先薄弱点：${item.weakTopics.join("、")}` : "";
      return `${item.subject}（${item.textbook}；考试范围：${item.examScope}${weakTopicSummary}）`;
    })
    .join("、");
  const diagnosticSummary = diagnosticWeakTopics.length
    ? diagnosticWeakTopics
        .slice(0, 8)
        .map((item) => `${item.subjectLabel}${item.unitLabel}·${item.knowledgePoint}`)
        .join("；")
    : "暂未识别出明显薄弱知识点，可安排均衡复习与巩固训练。";

  return `你是“知序”的 Timeline 规划引擎，现在需要为学生生成第一版考前复习 Timeline。

学生信息：
- 称呼：${displayName}
- 学习阶段：${userProfile.studyStage || "未设置"}
- 学校：${userProfile.school || "未填写"}
- 年级：${learningProfile.grade}
- 科目与教材：${subjectSummary}
- 诊断 Quiz 暴露的重点薄弱项：${diagnosticSummary}

计划输入：
- 考试名称：${input.examName}
- 考试日期：${input.examDate}
- 目标成绩：${input.targetScore || "未填写"}
- 每日可用学习时间：${input.dailyAvailableMinutes} 分钟
- 建议开学时间：${input.preferredStartTime}
- 不可用时间：${input.unavailableWindows || "未填写"}
- 固定安排：${input.fixedCommitments || "未填写"}
- 必须保留的硬边界：${input.mustKeepBoundaries || "未填写"}
- 当前重点与排序策略：${input.focusStrategy || "未填写"}
- 其他现实约束：${input.extraContext || "未填写"}

你必须严格遵守这些产品规则：
1. Timeline 是唯一权威来源，Todo 只能从 Timeline 派生。
2. 计划必须围绕考试日期倒推，按天和时间段分配任务。
3. 任务要有科目、开始时间、结束时间、时长、目标、完成标准、原因、优先级。
4. 需要尽量保留睡眠、课程等硬边界，不要挤占这些时间。
5. 任务应该尽量小而明确，避免笼统描述，如“复习一下”。
6. 如果信息不足，可以做合理假设，但必须写进 assumptions。
7. 如果存在明显风险、任务过载或需要用户确认的调整，写进 risks 和 pendingAdjustments。
8. 不要声称已经调用其他模块，也不要虚构日志、洞察或已完成状态。
9. Todo 不需要单独输出另一套任务，只需要输出可直接派生 Todo 的 Timeline tasks。

请只返回 JSON，不要返回 Markdown，不要解释，不要使用代码块。JSON 必须符合这个结构：
{
  "summary": "一句话总结计划",
  "explanation": "向学生解释这样排期的原因",
  "assumptions": ["假设1", "假设2"],
  "risks": [
    {
      "level": "high|medium|low",
      "title": "风险标题",
      "description": "风险描述"
    }
  ],
  "pendingAdjustments": [
    {
      "title": "待确认调整标题",
      "description": "展示给用户看的改动",
      "reason": "为什么要这样改",
      "impactLabel": "今晚|本周|+1天 之类的短标签"
    }
  ],
  "tasks": [
    {
      "dayOffset": 0,
      "durationMinutes": 45,
      "subject": "数学",
      "title": "任务标题",
      "knowledgePoints": ["知识点1", "知识点2"],
      "goal": "本任务目标",
      "completionCriteria": "怎样算完成",
      "priority": "high|medium|low",
      "reason": "为什么把它安排在这里"
    }
  ]
}

额外要求：
- 首版只输出最近 2 天的可执行计划，使用 dayOffset 表示：今天是 0，明天是 1。
- tasks 必须刚好输出 6 个，不多不少。
- 任务覆盖当前已选科目中的关键科目。
- 如果存在诊断 Quiz 薄弱点，至少 4 个任务要直接围绕这些薄弱点或所在单元。
- 每天安排 2 到 4 个任务。
- 每天任务总时长不要明显超过每日可用时间。
- 所有字段尽量简洁：
- title 控制在 16 个字以内。
- knowledgePoints 每个任务最多 2 个。
- goal、completionCriteria、reason 尽量各用 1 个短句。
- assumptions、risks、pendingAdjustments 各不超过 2 条。
- 不要输出任何额外字段，不要重复表达。
- 输出使用简体中文。`;
}

export function parseStudyPlanFromAI({
  rawText,
  examName,
  examDate,
  targetScore,
  preferredStartTime,
  dailyAvailableMinutes,
}: {
  rawText: string;
  examName: string;
  examDate: string;
  targetScore: string;
  preferredStartTime: string;
  dailyAvailableMinutes: number;
}): StudyPlanDocument {
  const payloadText = sanitizeJsonPayload(extractJsonPayload(rawText));
  let payload: RawStudyPlanPayload;
  try {
    payload = JSON.parse(payloadText) as RawStudyPlanPayload;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知 JSON 解析错误";
    const positionMatch = detail.match(/position (\d+)/);
    if (positionMatch) {
      const position = Number(positionMatch[1]);
      const previewStart = Math.max(0, position - 120);
      const previewEnd = Math.min(payloadText.length, position + 120);
      console.error("Timeline sanitized JSON around error", payloadText.slice(previewStart, previewEnd));
    }
    throw new Error(`AI 返回的计划不是合法 JSON：${detail}`);
  }
  const tasksSource = Array.isArray(payload.tasks) ? payload.tasks : [];
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);
  const groupedBlueprints = [0, 1].map((dayOffset) => (
    tasksSource.flatMap((task, index) => {
      if (!task || typeof task !== "object") return [];
      const entry = task as RawStudyPlanTaskPayload;
      const fallbackDayOffset = index < 3 ? 0 : 1;
      if (normalizeDayOffset(entry.dayOffset, fallbackDayOffset) !== dayOffset) return [];
      const title = sanitizeText(entry.title, "");
      const subject = sanitizeText(entry.subject, "");
      if (!title || !subject) return [];
      return [{
        index,
        subject,
        title,
        knowledgePoints: parseStringArray(entry.knowledgePoints).slice(0, 2),
        goal: sanitizeText(entry.goal, "完成当前任务并留下可复盘结果。"),
        completionCriteria: sanitizeText(entry.completionCriteria, "按任务要求完成并进行自检。"),
        priority: normalizePriority(entry.priority),
        reason: sanitizeText(entry.reason, "根据考试节奏、科目优先级和可用时间安排。"),
        durationMinutes: normalizeDurationMinutes(entry.durationMinutes, 45),
      }];
    })
  ));

  const tasks = groupedBlueprints
    .flatMap((dayEntries, dayOffset) => {
      if (dayEntries.length === 0) return [];
      const date = toDateKey(addDays(baseDate, dayOffset));
      const requestedDurations = dayEntries.map((entry) => entry.durationMinutes);
      const allocatedDurations = allocateDurations(dailyAvailableMinutes, requestedDurations);
      let cursor = parseClockToMinutes(normalizeTime(preferredStartTime, "19:00"));

      return dayEntries.map((entry, index) => {
        const durationMinutes = allocatedDurations[index] ?? 45;
        const startTime = formatMinutesToClock(cursor);
        const endTime = formatMinutesToClock(cursor + durationMinutes);
        cursor += durationMinutes + 10;

        return {
          id: `task-${entry.index + 1}-${crypto.randomUUID()}`,
          date,
          startTime,
          endTime,
          durationMinutes,
          subject: entry.subject,
          title: entry.title,
          knowledgePoints: entry.knowledgePoints,
          goal: entry.goal,
          completionCriteria: entry.completionCriteria,
          status: normalizeStatus("pending"),
          priority: entry.priority,
          locked: normalizeBoolean(false),
          dependencies: [],
          reason: entry.reason,
          source: "ai_generated" as const,
        } satisfies StudyPlanTask;
      });
    })
    .sort((left, right) => `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`));

  if (tasks.length === 0) {
    throw new Error("AI 返回了空计划，请补充考试信息后重试。");
  }

  const risks = (Array.isArray(payload.risks) ? payload.risks : [])
    .flatMap((risk, index) => {
      if (!risk || typeof risk !== "object") return [];
      const entry = risk as Record<string, unknown>;
      return [{
        id: `risk-${index + 1}`,
        level: entry.level === "high" || entry.level === "low" ? entry.level : "medium",
        title: sanitizeText(entry.title, "需要关注的计划风险"),
        description: sanitizeText(entry.description, "当前计划存在需要持续观察的风险。"),
      } satisfies StudyPlanRisk];
    });

  const pendingAdjustments = (Array.isArray(payload.pendingAdjustments) ? payload.pendingAdjustments : [])
    .flatMap((adjustment, index) => {
      if (!adjustment || typeof adjustment !== "object") return [];
      const entry = adjustment as Record<string, unknown>;
      return [{
        id: `adjustment-${index + 1}`,
        title: sanitizeText(entry.title, "待确认调整"),
        description: sanitizeText(entry.description, "生成了一项待确认调整。"),
        reason: sanitizeText(entry.reason, "为了降低风险并提升执行稳定性。"),
        impactLabel: sanitizeText(entry.impactLabel, "本周"),
      } satisfies StudyPlanAdjustment];
    });

  return {
    version: 1,
    examName,
    examDate,
    targetScore,
    generatedAt: new Date().toISOString(),
    summary: sanitizeText(payload.summary, "已生成一版可执行的考前 Timeline。"),
    explanation: sanitizeText(payload.explanation, "已根据考试日期、学习科目和每日可用时间生成计划。"),
    assumptions: parseStringArray(payload.assumptions),
    risks,
    pendingAdjustments,
    tasks,
  };
}

export function buildFallbackStudyPlan({
  examName,
  examDate,
  targetScore,
  preferredStartTime,
  dailyAvailableMinutes,
  subjects,
  diagnosticWeakTopics,
}: {
  examName: string;
  examDate: string;
  targetScore: string;
  preferredStartTime: string;
  dailyAvailableMinutes: number;
  subjects: SubjectDescriptor[];
  diagnosticWeakTopics: DiagnosticQuizWeakTopic[];
}): StudyPlanDocument {
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);
  const normalizedSubjects = subjects.length > 0
    ? subjects
    : [{ subject: "综合复习", textbook: "通用资料", examScope: "当前考试范围", weakTopics: [] }];
  const weakTopicsBySubject = new Map<string, string[]>();
  for (const topic of diagnosticWeakTopics) {
    const existing = weakTopicsBySubject.get(topic.subjectLabel) ?? [];
    if (!existing.includes(topic.knowledgePoint)) existing.push(topic.knowledgePoint);
    weakTopicsBySubject.set(topic.subjectLabel, existing);
  }
  const taskTemplates = Array.from({ length: 6 }, (_, index) => {
    const descriptor = normalizedSubjects[index % normalizedSubjects.length]!;
    const phase = index % 3;
    const weakTopics = weakTopicsBySubject.get(descriptor.subject) ?? descriptor.weakTopics;
    const primaryWeakTopic = weakTopics[0] ?? `${descriptor.subject}核心点`;
    return {
      dayOffset: index < 3 ? 0 : 1,
      subject: descriptor.subject,
      title: phase === 0
        ? `${descriptor.subject}薄弱梳理`
        : phase === 1
          ? `${descriptor.subject}专项训练`
          : `${descriptor.subject}错题回看`,
      knowledgePoints: [primaryWeakTopic, descriptor.examScope].slice(0, 2),
      goal: phase === 0 ? "梳理薄弱点并明确易错环节。" : phase === 1 ? "完成针对性训练并记录失误。" : "复盘错题并固化方法。",
      completionCriteria: phase === 0 ? "形成一页提纲。" : phase === 1 ? "完成练习并标记错因。" : "整理错题并复述方法。",
      priority: phase === 0 ? "high" : phase === 1 ? "medium" : "medium",
      reason: phase === 0
        ? "先围绕诊断暴露的问题建立修复框架。"
        : phase === 1
          ? "在理解后立刻训练，便于修复薄弱点。"
          : "当天复盘可减少遗忘和重复犯错。",
      durationMinutes: phase === 0 ? 50 : phase === 1 ? 45 : 35,
    };
  });

  const planText = JSON.stringify({
    summary: `已为 ${examName} 生成首版两日复习 Timeline。`,
    explanation: "先围绕考试范围和诊断薄弱点梳理重点，再训练与复盘，保证 Todo 可以直接从 Timeline 派生。",
    assumptions: ["默认今晚和明天都能按填写时间开始学习。"],
    risks: [{
      level: "medium",
      title: "真实可用时间可能波动",
      description: "若临时安排增加，第二天任务可能需要再次压缩。",
    }],
    pendingAdjustments: [{
      title: "确认固定安排",
      description: "如果明天有额外课程或出行，需要重新确认可用时段。",
      reason: "避免 Timeline 与真实时间冲突。",
      impactLabel: "明天",
    }],
    tasks: taskTemplates,
  });

  return parseStudyPlanFromAI({
    rawText: planText,
    examName,
    examDate,
    targetScore,
    preferredStartTime,
    dailyAvailableMinutes,
  });
}
