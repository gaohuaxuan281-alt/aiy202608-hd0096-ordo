import "server-only";

import { getD1 } from "../../db";
import { ensureAuthSchema } from "../auth";
import type {
  StoredStudyPlan,
  StudyPlanDocument,
  StudyPlanGenerationInput,
  StudyPlanTask,
  StudyPlanTaskPriority,
  StudyPlanTaskStatus,
  TodoSnapshot,
  TodoTaskSlice,
} from "./types";
import type {
  FeedbackAdjustmentOperation,
  FeedbackAdjustmentPayload,
} from "../../features/summary/summary-types";
import { validateTasksAgainstPlanConstraints } from "./constraints";

type StudyPlanRow = {
  id: string;
  userId: string;
  examName: string;
  examDate: string;
  targetScore: string;
  inputJson: string;
  planJson: string;
  model: string;
  rawResponse: string;
  parentPlanId: string | null;
  sourceAdjustmentId: string | null;
  createdAt: number;
  updatedAt: number;
};

function parseStoredPlan(row: StudyPlanRow): StoredStudyPlan {
  return {
    id: row.id,
    userId: row.userId,
    examName: row.examName,
    examDate: row.examDate,
    targetScore: row.targetScore,
    input: JSON.parse(row.inputJson) as StudyPlanGenerationInput,
    plan: JSON.parse(row.planJson) as StudyPlanDocument,
    model: row.model,
    rawResponse: row.rawResponse,
    parentPlanId: row.parentPlanId,
    sourceAdjustmentId: row.sourceAdjustmentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getLatestStudyPlan(userId: string): Promise<StoredStudyPlan | null> {
  await ensureAuthSchema();
  const row = await getD1()
    .prepare(`SELECT
      id,
      user_id AS userId,
      exam_name AS examName,
      exam_date AS examDate,
      target_score AS targetScore,
      input_json AS inputJson,
      plan_json AS planJson,
      model,
      raw_response AS rawResponse,
      parent_plan_id AS parentPlanId,
      source_adjustment_id AS sourceAdjustmentId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM study_plans
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 1`)
    .bind(userId)
    .first<StudyPlanRow>();

  return row ? parseStoredPlan(row) : null;
}

export async function getStudyPlans(userId: string): Promise<StoredStudyPlan[]> {
  await ensureAuthSchema();
  const rows = await getD1()
    .prepare(`SELECT
      id,
      user_id AS userId,
      exam_name AS examName,
      exam_date AS examDate,
      target_score AS targetScore,
      input_json AS inputJson,
      plan_json AS planJson,
      model,
      raw_response AS rawResponse,
      parent_plan_id AS parentPlanId,
      source_adjustment_id AS sourceAdjustmentId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM study_plans
    WHERE user_id = ?
    ORDER BY updated_at DESC, created_at DESC`)
    .bind(userId)
    .all<StudyPlanRow>();

  return (rows.results ?? []).map(parseStoredPlan);
}

export async function saveStudyPlan({
  userId,
  input,
  plan,
  model,
  rawResponse,
}: {
  userId: string;
  input: StudyPlanGenerationInput;
  plan: StudyPlanDocument;
  model: string;
  rawResponse: string;
}): Promise<StoredStudyPlan> {
  await ensureAuthSchema();
  const d1 = getD1();
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1
    .prepare(`INSERT INTO study_plans (
      id,
      user_id,
      exam_name,
      exam_date,
      target_score,
      input_json,
      plan_json,
      model,
      raw_response,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      userId,
      plan.examName,
      plan.examDate,
      plan.targetScore,
      JSON.stringify(input),
      JSON.stringify(plan),
      model,
      rawResponse,
      now,
      now,
    )
    .run();

  return {
    id,
    userId,
    examName: plan.examName,
    examDate: plan.examDate,
    targetScore: plan.targetScore,
    input,
    plan,
    model,
    rawResponse,
    parentPlanId: null,
    sourceAdjustmentId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateStudyPlanTaskStatus({
  userId,
  taskId,
  status,
}: {
  userId: string;
  taskId: string;
  status: StudyPlanTaskStatus;
}): Promise<StoredStudyPlan> {
  await ensureAuthSchema();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getLatestStudyPlan(userId);
    if (!current) throw new Error("STUDY_PLAN_NOT_FOUND");

    let found = false;
    const nextTasks = current.plan.tasks.map((task) => {
      if (task.id !== taskId) return task;
      found = true;
      return { ...task, status };
    });
    if (!found) throw new Error("STUDY_PLAN_TASK_NOT_FOUND");

    const nextPlan: StudyPlanDocument = { ...current.plan, tasks: nextTasks };
    const now = Math.max(Date.now(), current.updatedAt + 1);
    const result = await getD1()
      .prepare(`UPDATE study_plans
        SET plan_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND updated_at = ?
          AND NOT EXISTS (
            SELECT 1 FROM study_plans AS newer
            WHERE newer.user_id = ? AND newer.updated_at > ?
          )`)
      .bind(
        JSON.stringify(nextPlan),
        now,
        current.id,
        userId,
        current.updatedAt,
        userId,
        current.updatedAt,
      )
      .run();
    if ((result.meta?.changes ?? 0) > 0) {
      return { ...current, plan: nextPlan, updatedAt: now };
    }
  }

  throw new Error("STUDY_PLAN_CONFLICT");
}

type ApplyAdjustmentInput = {
  userId: string;
  adjustmentId: string;
  basePlanId: string | null;
  basePlanUpdatedAt: number | null;
  operation: FeedbackAdjustmentOperation;
  taskId: string | null;
  payload: FeedbackAdjustmentPayload;
  title: string;
  reason: string;
  expectedTask: Partial<StudyPlanTask> | null;
};

function parseDateKey(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function parseClockMinutes(value: string | null | undefined) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClockMinutes(value: number) {
  if (value < 0 || value >= 24 * 60) throw new Error("STUDY_PLAN_TIME_OUT_OF_RANGE");
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function dateKeyInShanghai(value = new Date()) {
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

function requireAdjustableTask(task: StudyPlanTask | undefined) {
  if (!task) throw new Error("STUDY_PLAN_TASK_NOT_FOUND");
  if (task.locked) throw new Error("STUDY_PLAN_TASK_LOCKED");
  if (task.status !== "pending" && task.status !== "delayed") {
    throw new Error("STUDY_PLAN_TASK_NOT_ADJUSTABLE");
  }
  return task;
}

function validateTargetDate(date: string, examDate: string) {
  if (!parseDateKey(date)) throw new Error("STUDY_PLAN_DATE_INVALID");
  if (date < dateKeyInShanghai() || date > examDate) {
    throw new Error("STUDY_PLAN_DATE_OUT_OF_RANGE");
  }
}

function validateStartNotPast(date: string, startTime: string) {
  const start = parseClockMinutes(startTime);
  if (date === dateKeyInShanghai() &&
    start !== null &&
    start <= clockMinutesInShanghai(new Date())) {
    throw new Error("STUDY_PLAN_TIME_IN_PAST");
  }
}

function taskEndTime(startTime: string, durationMinutes: number) {
  const start = parseClockMinutes(startTime);
  if (start === null || !Number.isInteger(durationMinutes) || durationMinutes < 20 || durationMinutes > 240) {
    throw new Error("STUDY_PLAN_TIME_INVALID");
  }
  return formatClockMinutes(start + durationMinutes);
}

function verifyExpectedTask(task: StudyPlanTask, expected: Partial<StudyPlanTask> | null) {
  if (!expected) return;
  for (const key of ["id", "date", "startTime", "durationMinutes", "status", "locked"] as const) {
    if (expected[key] !== undefined && task[key] !== expected[key]) {
      throw new Error("STUDY_PLAN_CONFLICT");
    }
  }
}

function validateNoOverlap(tasks: StudyPlanTask[]) {
  const active = tasks
    .filter((task) => task.status !== "cancelled")
    .toSorted((left, right) => `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`));
  for (let index = 1; index < active.length; index += 1) {
    const previous = active[index - 1];
    const current = active[index];
    if (previous.date === current.date && previous.endTime > current.startTime) {
      throw new Error("STUDY_PLAN_TASK_OVERLAP");
    }
  }
}

function validateDailyBudget(tasks: StudyPlanTask[], dailyAvailableMinutes: number) {
  const totals = new Map<string, number>();
  for (const task of tasks) {
    if (task.status === "cancelled") continue;
    totals.set(task.date, (totals.get(task.date) ?? 0) + task.durationMinutes);
  }
  if ([...totals.values()].some((minutes) => minutes > dailyAvailableMinutes)) {
    throw new Error("STUDY_PLAN_DAILY_BUDGET_EXCEEDED");
  }
}

function validateDependencies(tasks: StudyPlanTask[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    if (task.dependencies.includes(task.id)) throw new Error("STUDY_PLAN_DEPENDENCY_INVALID");
    for (const dependencyId of task.dependencies) {
      const dependency = byId.get(dependencyId);
      if (!dependency) throw new Error("STUDY_PLAN_DEPENDENCY_INVALID");
      if (`${dependency.date}T${dependency.endTime}` > `${task.date}T${task.startTime}`) {
        throw new Error("STUDY_PLAN_DEPENDENCY_ORDER_INVALID");
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) throw new Error("STUDY_PLAN_DEPENDENCY_CYCLE");
    visiting.add(taskId);
    for (const dependencyId of byId.get(taskId)?.dependencies ?? []) visit(dependencyId);
    visiting.delete(taskId);
    visited.add(taskId);
  }
  for (const task of tasks) visit(task.id);
}

function affectedTaskIds(input: ApplyAdjustmentInput, tasks: StudyPlanTask[]) {
  if (input.operation === "split_task" && input.taskId) {
    const prefix = `${input.taskId}-part-`;
    return new Set(tasks.filter((task) => task.id.startsWith(prefix)).map((task) => task.id));
  }
  if (input.operation === "add_practice") {
    return new Set([`feedback-practice-${input.adjustmentId}`]);
  }
  return new Set(input.taskId ? [input.taskId] : []);
}

function applyOperation(
  current: StoredStudyPlan,
  input: ApplyAdjustmentInput,
): StudyPlanTask[] {
  const taskIndex = input.taskId
    ? current.plan.tasks.findIndex((task) => task.id === input.taskId)
    : -1;
  const target = input.taskId ? requireAdjustableTask(current.plan.tasks[taskIndex]) : null;
  if (target) verifyExpectedTask(target, input.expectedTask);

  if (input.operation === "move_task") {
    if (!target) throw new Error("STUDY_PLAN_TASK_NOT_FOUND");
    const date = parseDateKey(input.payload.date);
    const startTime = input.payload.startTime ?? null;
    if (!date || parseClockMinutes(startTime) === null) throw new Error("STUDY_PLAN_TIME_INVALID");
    validateTargetDate(date, current.plan.examDate);
    validateStartNotPast(date, startTime!);
    const moved: StudyPlanTask = {
      ...target,
      date,
      startTime: startTime!,
      endTime: taskEndTime(startTime!, target.durationMinutes),
      status: "pending",
      reason: input.reason,
      source: "ai_adjusted",
    };
    return current.plan.tasks.with(taskIndex, moved);
  }

  if (input.operation === "shorten_task") {
    if (!target) throw new Error("STUDY_PLAN_TASK_NOT_FOUND");
    if (target.date < dateKeyInShanghai()) throw new Error("STUDY_PLAN_DATE_OUT_OF_RANGE");
    validateStartNotPast(target.date, target.startTime);
    const duration = input.payload.durationMinutes;
    if (!Number.isInteger(duration) || duration! < 20 || duration! >= target.durationMinutes) {
      throw new Error("STUDY_PLAN_DURATION_INVALID");
    }
    const shortened: StudyPlanTask = {
      ...target,
      durationMinutes: duration!,
      endTime: taskEndTime(target.startTime, duration!),
      reason: input.reason,
      source: "ai_adjusted",
    };
    return current.plan.tasks.with(taskIndex, shortened);
  }

  if (input.operation === "split_task") {
    if (!target) throw new Error("STUDY_PLAN_TASK_NOT_FOUND");
    if (target.date < dateKeyInShanghai()) throw new Error("STUDY_PLAN_DATE_OUT_OF_RANGE");
    validateStartNotPast(target.date, target.startTime);
    if (target.durationMinutes < 40) throw new Error("STUDY_PLAN_DURATION_INVALID");
    const firstDuration = Math.ceil(target.durationMinutes / 2);
    const secondDuration = target.durationMinutes - firstDuration;
    if (secondDuration < 20) throw new Error("STUDY_PLAN_DURATION_INVALID");
    const firstEnd = taskEndTime(target.startTime, firstDuration);
    const suffix = input.adjustmentId.slice(-8);
    const firstId = `${target.id}-part-1-${suffix}`;
    const secondId = `${target.id}-part-2-${suffix}`;
    const first: StudyPlanTask = {
      ...target,
      id: firstId,
      title: `${target.title}（1/2）`,
      durationMinutes: firstDuration,
      endTime: firstEnd,
      status: "pending",
      reason: input.reason,
      source: "ai_adjusted",
    };
    const second: StudyPlanTask = {
      ...target,
      id: secondId,
      title: `${target.title}（2/2）`,
      startTime: firstEnd,
      endTime: taskEndTime(firstEnd, secondDuration),
      durationMinutes: secondDuration,
      status: "pending",
      dependencies: [firstId],
      reason: input.reason,
      source: "ai_adjusted",
    };
    return current.plan.tasks
      .flatMap((task) => task.id === target.id ? [first, second] : [task])
      .map((task) => task.id === firstId || task.id === secondId
        ? task
        : { ...task, dependencies: task.dependencies.map((id) => id === target.id ? secondId : id) });
  }

  if (input.operation === "add_practice") {
    const date = parseDateKey(input.payload.date);
    const startTime = input.payload.startTime ?? null;
    const duration = input.payload.durationMinutes;
    const subject = input.payload.subject?.trim() ?? "";
    const knowledgePoint = input.payload.knowledgePoint?.trim() ?? "";
    if (!date || parseClockMinutes(startTime) === null || !Number.isInteger(duration)) {
      throw new Error("STUDY_PLAN_TIME_INVALID");
    }
    validateTargetDate(date, current.plan.examDate);
    validateStartNotPast(date, startTime!);
    if (duration! < 20 || duration! > 120) throw new Error("STUDY_PLAN_DURATION_INVALID");
    const validSubjects = new Set(current.plan.tasks.map((task) => task.subject));
    if (!subject || !validSubjects.has(subject)) throw new Error("STUDY_PLAN_SUBJECT_INVALID");
    if (!knowledgePoint || knowledgePoint.length > 80) throw new Error("STUDY_PLAN_KNOWLEDGE_INVALID");
    const task: StudyPlanTask = {
      id: `feedback-practice-${input.adjustmentId}`,
      date,
      startTime: startTime!,
      endTime: taskEndTime(startTime!, duration!),
      durationMinutes: duration!,
      subject,
      title: `${knowledgePoint}针对练习`,
      knowledgePoints: [knowledgePoint],
      goal: `针对反馈中暴露的薄弱点巩固 ${knowledgePoint}`,
      completionCriteria: "完成练习并记录仍不确定的步骤",
      status: "pending",
      priority: "high",
      locked: false,
      dependencies: [],
      reason: input.reason,
      source: "ai_adjusted",
    };
    return [...current.plan.tasks, task];
  }

  throw new Error("STUDY_PLAN_OPERATION_UNSUPPORTED");
}

export async function getStudyPlanById(userId: string, planId: string) {
  const row = await getD1()
    .prepare(`SELECT
      id,
      user_id AS userId,
      exam_name AS examName,
      exam_date AS examDate,
      target_score AS targetScore,
      input_json AS inputJson,
      plan_json AS planJson,
      model,
      raw_response AS rawResponse,
      parent_plan_id AS parentPlanId,
      source_adjustment_id AS sourceAdjustmentId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM study_plans WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(planId, userId)
    .first<StudyPlanRow>();
  return row ? parseStoredPlan(row) : null;
}

async function isPlanDescendantOf(
  userId: string,
  plan: StoredStudyPlan,
  ancestorPlanId: string,
) {
  let cursor: StoredStudyPlan | null = plan;
  for (let depth = 0; cursor && depth < 50; depth += 1) {
    if (cursor.id === ancestorPlanId) return true;
    cursor = cursor.parentPlanId
      ? await getStudyPlanById(userId, cursor.parentPlanId)
      : null;
  }
  return false;
}

export async function applyFeedbackAdjustment(input: ApplyAdjustmentInput) {
  await ensureAuthSchema();
  const d1 = getD1();
  const adjustedPlanId = `feedback-adjustment-${input.adjustmentId}`;
  const existing = await getStudyPlanById(input.userId, adjustedPlanId);
  if (existing) return existing;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getLatestStudyPlan(input.userId);
    if (!current) throw new Error("STUDY_PLAN_NOT_FOUND");
    if (input.basePlanId) {
      const isDescendant = await isPlanDescendantOf(input.userId, current, input.basePlanId);
      if (!isDescendant ||
        (current.id === input.basePlanId &&
          input.basePlanUpdatedAt !== null &&
          current.updatedAt !== input.basePlanUpdatedAt)) {
        throw new Error("STUDY_PLAN_CONFLICT");
      }
    }

    const tasks = applyOperation(current, input)
      .toSorted((left, right) =>
        `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`),
      );
    validateNoOverlap(tasks);
    validateDailyBudget(tasks, current.input.dailyAvailableMinutes);
    validateDependencies(tasks);
    validateTasksAgainstPlanConstraints(tasks, current.input, affectedTaskIds(input, tasks));

    const now = Math.max(Date.now(), current.updatedAt + 1);
    const nextPlan: StudyPlanDocument = {
      ...current.plan,
      version: current.plan.version + 1,
      generatedAt: new Date(now).toISOString(),
      explanation: `${current.plan.explanation}\n根据每日反馈并经用户确认：${input.reason}`.trim(),
      tasks,
    };

    try {
      const insertResult = await d1
        .prepare(`INSERT INTO study_plans (
          id, user_id, exam_name, exam_date, target_score, input_json, plan_json,
          model, raw_response, parent_plan_id, source_adjustment_id, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM study_plans AS base
        WHERE base.id = ? AND base.user_id = ? AND base.updated_at = ?
          AND NOT EXISTS (
            SELECT 1 FROM study_plans AS newer
            WHERE newer.user_id = ? AND newer.updated_at > ?
          )`)
        .bind(
          adjustedPlanId,
          input.userId,
          nextPlan.examName,
          nextPlan.examDate,
          nextPlan.targetScore,
          JSON.stringify(current.input),
          JSON.stringify(nextPlan),
          "feedback-confirmed",
          JSON.stringify(nextPlan),
          current.id,
          input.adjustmentId,
          now,
          now,
          current.id,
          input.userId,
          current.updatedAt,
          input.userId,
          current.updatedAt,
        )
        .run();
      if ((insertResult.meta?.changes ?? 0) === 0) continue;

      return {
        id: adjustedPlanId,
        userId: input.userId,
        examName: nextPlan.examName,
        examDate: nextPlan.examDate,
        targetScore: nextPlan.targetScore,
        input: current.input,
        plan: nextPlan,
        model: "feedback-confirmed",
        rawResponse: JSON.stringify(nextPlan),
        parentPlanId: current.id,
        sourceAdjustmentId: input.adjustmentId,
        createdAt: now,
        updatedAt: now,
      } satisfies StoredStudyPlan;
    } catch (error) {
      const idempotent = await getStudyPlanById(input.userId, adjustedPlanId);
      if (idempotent) return idempotent;
      const latest = await getLatestStudyPlan(input.userId);
      if (attempt < 2 && latest && latest.id !== current.id) continue;
      throw error;
    }
  }

  throw new Error("STUDY_PLAN_CONFLICT");
}

function toDateKey(value: Date) {
  return dateKeyInShanghai(value);
}

function clockMinutesInShanghai(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return read("hour") * 60 + read("minute");
}

function compareTaskOrder(left: StudyPlanTask, right: StudyPlanTask) {
  return `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`);
}

function buildTaskTimeLabel(task: StudyPlanTask) {
  return `${task.startTime}–${task.endTime}`;
}

function isTaskCompleted(status: StudyPlanTaskStatus) {
  return status === "completed";
}

function taskPriorityValue(priority: StudyPlanTaskPriority) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function toTodoTaskSlice(task: StudyPlanTask, overdue: boolean): TodoTaskSlice {
  return {
    id: task.id,
    subject: task.subject,
    title: task.title,
    timeLabel: buildTaskTimeLabel(task),
    durationMinutes: task.durationMinutes,
    status: task.status,
    priority: task.priority,
    goal: task.goal,
    completionCriteria: task.completionCriteria,
    knowledgePoints: task.knowledgePoints,
    reason: task.reason,
    source: task.source === "ai_adjusted" ? "AI 调整后计划" : "AI 初始计划",
    dependencies: task.dependencies,
    overdue,
  };
}

export function buildTodoSnapshot(planRecord: StoredStudyPlan, now = new Date()): TodoSnapshot {
  const todayKey = toDateKey(now);
  const currentMinutes = clockMinutesInShanghai(now);
  const sortedTasks = [...planRecord.plan.tasks].sort(compareTaskOrder);
  const allToday = sortedTasks.filter(
    (task) => task.date === todayKey && task.status !== "cancelled",
  );
  const completedTasks = allToday
    .filter((task) => isTaskCompleted(task.status))
    .sort((left, right) => `${left.startTime}`.localeCompare(`${right.startTime}`))
    .map((task) => toTodoTaskSlice(task, false));

  const overdueTasks = sortedTasks
    .filter((task) => {
      if (isTaskCompleted(task.status) || task.status === "cancelled") return false;
      const endMinutes = parseClockMinutes(task.endTime);
      return task.date < todayKey ||
        (task.date === todayKey && endMinutes !== null && endMinutes < currentMinutes);
    })
    .map((task) => toTodoTaskSlice(task, true));

  const orderedToday = allToday
    .map((task) => toTodoTaskSlice(task, false))
    .sort((left, right) => {
      if (left.status !== right.status) {
        if (left.status === "in_progress") return -1;
        if (right.status === "in_progress") return 1;
      }
      const timeCompare = left.timeLabel.localeCompare(right.timeLabel);
      if (timeCompare !== 0) return timeCompare;
      return taskPriorityValue(left.priority) - taskPriorityValue(right.priority);
    });

  const actionableToday = orderedToday.filter(
    (task) => !isTaskCompleted(task.status) && task.status !== "cancelled",
  );
  const currentTask = actionableToday.find((task) => task.status === "in_progress") ?? null;
  const nextTask = actionableToday.find((task) => task.status === "pending") ?? null;
  const upcomingTasks = actionableToday.filter((task) => task.status === "pending");
  const completedCount = completedTasks.length;
  const totalCount = orderedToday.length;

  return {
    planId: planRecord.id,
    examName: planRecord.plan.examName,
    examDate: planRecord.plan.examDate,
    generatedAt: planRecord.plan.generatedAt,
    todayKey,
    completionPercent: totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100),
    completedCount,
    totalCount,
    currentTask,
    nextTask,
    todayTasks: actionableToday,
    completedTasks,
    overdueTasks,
    upcomingTasks,
  };
}
