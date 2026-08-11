import type { LearningProfile } from "../learning-profile";
import type { DiagnosticQuizWeakTopic } from "../diagnostic-quiz-types";
import { getDateAfterDays, getDaysUntilExam } from "../exam-plan";
import type { UserProfile } from "../profile-types";
import {
  clampTimelineTaskDuration,
  MAX_TIMELINE_TASK_MINUTES,
  MIN_TIMELINE_TASK_MINUTES,
  PREFERRED_MAX_TIMELINE_TASK_MINUTES,
  PREFERRED_TIMELINE_TASK_MINUTES,
} from "./granularity";
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

type StudyPlanBlueprint = {
  index: number;
  dayOffset: number;
  durationMinutes: number;
  subject: string;
  title: string;
  knowledgePoints: string[];
  goal: string;
  completionCriteria: string;
  priority: StudyPlanTask["priority"];
  reason: string;
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
      minItems: 1,
      maxItems: 18,
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
          dayOffset: { type: "integer", minimum: 0, maximum: 365 },
          durationMinutes: {
            type: "integer",
            minimum: MIN_TIMELINE_TASK_MINUTES,
            maximum: MAX_TIMELINE_TASK_MINUTES,
          },
          subject: { type: "string" },
          title: { type: "string" },
          knowledgePoints: {
            type: "array",
            minItems: 1,
            maxItems: 2,
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

function getStudyDayCount(examDate: string) {
  const daysUntilExam = getDaysUntilExam(examDate);
  return Number.isFinite(daysUntilExam)
    ? Math.min(366, Math.max(1, daysUntilExam))
    : 1;
}

function normalizeDayOffset(value: unknown, maxDayOffset: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Math.min(maxDayOffset, Math.max(0, fallback));
  }
  return Math.min(maxDayOffset, Math.max(0, Math.round(value)));
}

function normalizeDurationMinutes(value: unknown, fallback: number) {
  return clampTimelineTaskDuration(value, fallback);
}

function allocateDurations(totalMinutes: number, requested: number[]) {
  if (requested.length === 0) return [];
  let remaining = Math.max(
    MIN_TIMELINE_TASK_MINUTES * requested.length,
    totalMinutes,
  );

  return requested.map((value, index) => {
    const tasksLeft = requested.length - index - 1;
    const minimumLeft = tasksLeft * MIN_TIMELINE_TASK_MINUTES;
    const maxCurrent = Math.min(
      MAX_TIMELINE_TASK_MINUTES,
      Math.max(MIN_TIMELINE_TASK_MINUTES, remaining - minimumLeft),
    );
    const planned = Math.min(maxCurrent, clampTimelineTaskDuration(value));
    remaining -= planned;
    return planned;
  });
}

const ACTIONABLE_TITLE_PATTERN =
  /(写出|完成|订正|口述|默写|画出|列出|解答|核对|背诵|朗读|翻译|整理|标注|重做|计算|证明|比较|自测|复述)/;
const MEASURABLE_RESULT_PATTERN =
  /(\d+|至少|全部).*(题|道|条|个|次|遍|组|篇|词|句|步骤|要点|公式|错题|例题|图)/;
const NUMBERED_STEPS_PATTERN = /(?:1[.、]|①).*(?:2[.、]|②)/;

function compactTaskLabel(value: string) {
  const normalized = value.replace(/\s+/g, "").replace(/[，。；：、,.!?！？]/g, "");
  return normalized.length <= 10 ? normalized : `${normalized.slice(0, 9)}…`;
}

function normalizeConcreteBlueprint(blueprint: StudyPlanBlueprint): StudyPlanBlueprint {
  const knowledgePoints = blueprint.knowledgePoints.length
    ? blueprint.knowledgePoints.slice(0, 2)
    : [blueprint.title];
  const primaryPoint = knowledgePoints[0] || `${blueprint.subject}当前考点`;
  const compactPoint = compactTaskLabel(primaryPoint);
  const title = blueprint.title.length <= 24 &&
      ACTIONABLE_TITLE_PATTERN.test(blueprint.title) &&
      MEASURABLE_RESULT_PATTERN.test(blueprint.title)
    ? blueprint.title
    : `完成${compactPoint}相关题3道并订正`;
  const goal = NUMBERED_STEPS_PATTERN.test(blueprint.goal)
    ? blueprint.goal
    : `1. 不看资料写出${primaryPoint}的关键规则；2. 完成3道相关题；3. 核对答案并重做错题。`;
  const completionCriteria = MEASURABLE_RESULT_PATTERN.test(
    blueprint.completionCriteria,
  )
    ? blueprint.completionCriteria
    : "写出至少2条规则，完成3题，并把全部错题订正到答案正确。";

  return {
    ...blueprint,
    title,
    knowledgePoints,
    goal,
    completionCriteria,
    durationMinutes: Math.min(
      PREFERRED_MAX_TIMELINE_TASK_MINUTES,
      normalizeDurationMinutes(
        blueprint.durationMinutes,
        PREFERRED_TIMELINE_TASK_MINUTES,
      ),
    ),
  };
}

function buildDerivedMicroTask(
  base: StudyPlanBlueprint,
  variant: number,
  index: number,
): StudyPlanBlueprint {
  const primaryPoint = base.knowledgePoints[0] || base.title;
  const compactPoint = compactTaskLabel(primaryPoint);
  if (variant % 2 === 0) {
    return {
      ...base,
      index,
      title: `写出${compactPoint}要点2条`,
      goal: `1. 合上资料回忆${primaryPoint}；2. 写出2条核心要点；3. 对照教材或课堂笔记补漏。`,
      completionCriteria: "纸面留下至少2条要点，遗漏处已经补全并用不同颜色标出。",
      durationMinutes: PREFERRED_TIMELINE_TASK_MINUTES,
      reason: `${base.reason.replace(/[。；;]$/, "")}；先用短时闭卷回忆暴露遗漏。`,
    };
  }
  return {
    ...base,
    index,
    title: `口述${compactPoint}解题步骤`,
    goal: `1. 选1道与${primaryPoint}相关的已做题；2. 不看答案口述解题步骤；3. 卡住处回看并再说1遍。`,
    completionCriteria: "完整口述1遍解题步骤，并记录至少1个容易卡住的环节。",
    durationMinutes: MIN_TIMELINE_TASK_MINUTES,
    reason: `${base.reason.replace(/[。；;]$/, "")}；用短时复述检查是否真正理解。`,
  };
}

function expandDayBlueprints(
  dayEntries: StudyPlanBlueprint[],
  dailyAvailableMinutes: number,
) {
  const maxTaskCount = Math.max(
    1,
    Math.min(3, Math.floor(dailyAvailableMinutes / MIN_TIMELINE_TASK_MINUTES)),
  );
  const preferredTaskCount = Math.min(
    maxTaskCount,
    dailyAvailableMinutes >= 50 ? 3 : 2,
  );
  const entries = dayEntries
    .map(normalizeConcreteBlueprint)
    .slice(0, maxTaskCount);
  if (entries.length === 0) return entries;

  const targetCount = Math.max(entries.length, preferredTaskCount);
  const base = entries[0]!;
  while (entries.length < targetCount) {
    entries.push(buildDerivedMicroTask(
      base,
      entries.length - 1,
      base.index * 10 + entries.length + 1,
    ));
  }
  return entries;
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
  const studyDayCount = getStudyDayCount(input.examDate);
  const lastStudyDayOffset = studyDayCount - 1;
  const preferredTasksPerDay = Math.min(
    3,
    Math.max(2, Math.floor(input.dailyAvailableMinutes / PREFERRED_TIMELINE_TASK_MINUTES)),
  );
  const requestedBlueprintCount = Math.min(
    18,
    studyDayCount * preferredTasksPerDay,
  );
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
- 建议开始学习时间：${input.preferredStartTime}
- 不可用时间：${input.unavailableWindows || "未填写"}
- 固定安排：${input.fixedCommitments || "未填写"}
- 必须保留的硬边界：${input.mustKeepBoundaries || "未填写"}
- 当前重点与排序策略：${input.focusStrategy || "未填写"}
- 其他现实约束：${input.extraContext || "未填写"}

你必须严格遵守这些产品规则：
1. Timeline 是唯一权威来源，Todo 只能从 Timeline 派生。
2. 计划必须围绕考试日期倒推，按天和时间段分配任务。
3. 每个任务框只允许放一个可独立完成的微任务，时长优先 10–20 分钟，永远不能超过 30 分钟。
4. 需要尽量保留睡眠、课程等硬边界，不要挤占这些时间。
5. 任务必须具体到学生打开 Timeline 后可以立刻照做：写明操作对象、动作、数量或范围、执行步骤和可核对的完成结果。
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
      "durationMinutes": 15,
      "subject": "数学",
      "title": "完成函数单调性3题并订正",
      "knowledgePoints": ["函数单调性"],
      "goal": "1. 写出判定步骤；2. 完成3题；3. 核对并重做错题。",
      "completionCriteria": "完成3题，全部错题写明错因并重做正确。",
      "priority": "high",
      "reason": "诊断显示函数单调性容易失分，先用短练习定位错误。"
    }
  ]
}

额外要求：
- 学习日期必须从今天开始，一直覆盖到考试前一天，共 ${studyDayCount} 天；dayOffset 从 0 到 ${lastStudyDayOffset}。
- tasks 输出 ${requestedBlueprintCount} 个微任务蓝图。短周期内同一天可以安排 2–3 个不同动作的任务；长周期要均匀覆盖前期、中期和考前阶段，系统会据此补齐每天任务。
- 任务覆盖当前已选科目中的关键科目。
- 如果存在诊断 Quiz 薄弱点，优先让任务直接围绕这些薄弱点或所在单元。
- 每天至少安排 1 个任务，任务总时长不要明显超过每日可用时间。
- durationMinutes 必须是 10–30 的整数，优先使用 10、15 或 20；只有任务确实无法再拆时才允许 21–30。
- title 必须以可执行动作表达，并带数量、范围或产出。禁止“复习一下”“薄弱梳理”“专项训练”“错题回看”“巩固知识点”这类笼统标题。
- goal 必须写成 2–3 个带序号的执行步骤，例如“1. 闭卷写规则；2. 做3题；3. 订正错题”。
- completionCriteria 必须可量化、可勾选验收，例如题数、要点数、订正结果或口述次数；不要只写“理解”“掌握”“完成练习”。
- 不要虚构教材页码、老师布置的题号或学生未提供的资料；没有具体题号时，用知识点 + 题量描述。
- 所有字段尽量简洁：
- title 控制在 24 个字以内。
- knowledgePoints 每个任务最多 2 个。
- goal 用一行写完 2–3 个编号步骤；completionCriteria、reason 各用 1 个短句。
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
  const studyDayCount = getStudyDayCount(examDate);
  const maxDayOffset = studyDayCount - 1;
  const blueprints: StudyPlanBlueprint[] = tasksSource.flatMap((task, index) => {
      if (!task || typeof task !== "object") return [];
      const entry = task as RawStudyPlanTaskPayload;
      const title = sanitizeText(entry.title, "");
      const subject = sanitizeText(entry.subject, "");
      if (!title || !subject) return [];
      return [{
        index,
        dayOffset: normalizeDayOffset(entry.dayOffset, maxDayOffset, index),
        subject,
        title,
        knowledgePoints: parseStringArray(entry.knowledgePoints).slice(0, 2),
        goal: sanitizeText(entry.goal, ""),
        completionCriteria: sanitizeText(entry.completionCriteria, ""),
        priority: normalizePriority(entry.priority),
        reason: sanitizeText(entry.reason, "根据考试节奏、科目优先级和可用时间安排。"),
        durationMinutes: normalizeDurationMinutes(
          entry.durationMinutes,
          PREFERRED_TIMELINE_TASK_MINUTES,
        ),
      }];
    });
  const groupedBlueprints = Array.from({ length: studyDayCount }, (_, dayOffset) => {
    const directEntries = blueprints.filter((entry) => entry.dayOffset === dayOffset);
    if (directEntries.length > 0) return directEntries;
    if (blueprints.length === 0) return [];
    const template = blueprints[dayOffset % blueprints.length]!;
    return [{
      ...template,
      index: blueprints.length + dayOffset,
      dayOffset,
      reason: `${template.reason}（补齐考试前每日复习安排。）`,
    }];
  });

  const tasks = groupedBlueprints
    .flatMap((dayEntries, dayOffset) => {
      if (dayEntries.length === 0) return [];
      const date = getDateAfterDays(dayOffset);
      const scheduledEntries = expandDayBlueprints(
        dayEntries,
        dailyAvailableMinutes,
      );
      const requestedDurations = scheduledEntries.map((entry) => entry.durationMinutes);
      const allocatedDurations = allocateDurations(dailyAvailableMinutes, requestedDurations);
      const scheduledStudyMinutes = allocatedDurations.reduce(
        (total, duration) => total + duration,
        0,
      );
      const breakCount = Math.max(0, scheduledEntries.length - 1);
      const breakMinutes = breakCount > 0
        ? Math.min(
            10,
            Math.floor(
              Math.max(0, dailyAvailableMinutes - scheduledStudyMinutes) /
                breakCount,
            ),
          )
        : 0;
      let cursor = parseClockToMinutes(normalizeTime(preferredStartTime, "19:00"));

      return scheduledEntries.map((entry, index) => {
        const durationMinutes = allocatedDurations[index] ??
          PREFERRED_TIMELINE_TASK_MINUTES;
        const startTime = formatMinutesToClock(cursor);
        const endTime = formatMinutesToClock(cursor + durationMinutes);
        cursor += durationMinutes + breakMinutes;

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
  const studyDayCount = getStudyDayCount(examDate);
  const normalizedSubjects = subjects.length > 0
    ? subjects
    : [{ subject: "综合复习", textbook: "通用资料", examScope: "当前考试范围", weakTopics: [] }];
  const weakTopicsBySubject = new Map<string, string[]>();
  for (const topic of diagnosticWeakTopics) {
    const existing = weakTopicsBySubject.get(topic.subjectLabel) ?? [];
    if (!existing.includes(topic.knowledgePoint)) existing.push(topic.knowledgePoint);
    weakTopicsBySubject.set(topic.subjectLabel, existing);
  }
  const taskTemplates = Array.from({ length: studyDayCount }, (_, index) => {
    const descriptor = normalizedSubjects[index % normalizedSubjects.length]!;
    const progress = studyDayCount === 1 ? 1 : index / (studyDayCount - 1);
    const phase = progress < 0.45 ? 0 : progress < 0.8 ? 1 : 2;
    const weakTopics = weakTopicsBySubject.get(descriptor.subject) ?? descriptor.weakTopics;
    const hasWeakTopic = Boolean(weakTopics[0]);
    const primaryWeakTopic = weakTopics[0] ?? descriptor.examScope;
    const compactPoint = compactTaskLabel(primaryWeakTopic);
    return {
      dayOffset: index,
      subject: descriptor.subject,
      title: phase === 0
        ? hasWeakTopic
          ? `写出${compactPoint}规则2条`
          : `列出${compactPoint}考点3个`
        : phase === 1
          ? `完成${compactPoint}相关题3道并订正`
          : `重做${compactPoint}错题2道`,
      knowledgePoints: [primaryWeakTopic, descriptor.examScope].slice(0, 2),
      goal: phase === 0
        ? hasWeakTopic
          ? `1. 闭卷写出${primaryWeakTopic}的2条规则；2. 对照教材或笔记补漏；3. 圈出1个易错条件。`
          : `1. 打开教材目录定位${descriptor.examScope}；2. 写出3个具体考点；3. 给最不熟的1项画星号。`
        : phase === 1
          ? `1. 完成${primaryWeakTopic}相关的3道题；2. 核对答案；3. 错题写明错因后重做。`
          : `1. 选2道${primaryWeakTopic}错题；2. 遮住答案重做；3. 口述每题的关键步骤。`,
      completionCriteria: phase === 0
        ? hasWeakTopic
          ? "留下至少2条规则和1个易错条件，遗漏内容已经补全。"
          : "写出3个具体考点，并给最不熟的1项完成星号标记。"
        : phase === 1
          ? "完成3题，全部错题写明错因并重做正确。"
          : "2道错题均独立重做正确，并各口述1遍关键步骤。",
      priority: phase === 0 ? "high" : phase === 1 ? "medium" : "medium",
      reason: phase === 0
        ? "先围绕诊断暴露的问题建立修复框架。"
        : phase === 1
          ? "在理解后立刻训练，便于修复薄弱点。"
          : "当天复盘可减少遗忘和重复犯错。",
      durationMinutes: phase === 1
        ? PREFERRED_MAX_TIMELINE_TASK_MINUTES
        : PREFERRED_TIMELINE_TASK_MINUTES,
    };
  });

  const planText = JSON.stringify({
    summary: `已为 ${examName} 生成从今天到考试前一天的 ${studyDayCount} 日复习 Timeline。`,
    explanation: "从今天开始逐日安排薄弱梳理、专项训练和考前复盘，保证 Todo 可以直接从 Timeline 派生。",
    assumptions: ["默认每天都能按填写的学习时段执行至少一项复习任务。"],
    risks: [{
      level: "medium",
      title: "真实可用时间可能波动",
      description: "若临时安排增加，对应日期的任务可能需要再次压缩。",
    }],
    pendingAdjustments: [{
      title: "确认固定安排",
      description: "如果后续日期有额外课程或出行，需要重新确认可用时段。",
      reason: "避免 Timeline 与真实时间冲突。",
      impactLabel: "考前",
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
