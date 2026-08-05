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
  const current = await getLatestStudyPlan(userId);
  if (!current) {
    throw new Error("STUDY_PLAN_NOT_FOUND");
  }

  let found = false;
  const nextTasks = current.plan.tasks.map((task) => {
    if (task.id !== taskId) return task;
    found = true;
    return {
      ...task,
      status,
    };
  });

  if (!found) {
    throw new Error("STUDY_PLAN_TASK_NOT_FOUND");
  }

  const nextPlan: StudyPlanDocument = {
    ...current.plan,
    tasks: nextTasks,
  };
  const now = Date.now();

  await getD1()
    .prepare(`UPDATE study_plans
      SET plan_json = ?, raw_response = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`)
    .bind(
      JSON.stringify(nextPlan),
      JSON.stringify(nextPlan),
      now,
      current.id,
      userId,
    )
    .run();

  return {
    ...current,
    plan: nextPlan,
    rawResponse: JSON.stringify(nextPlan),
    updatedAt: now,
  };
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
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
  const nowIso = now.toISOString();
  const todayKey = toDateKey(now);
  const sortedTasks = [...planRecord.plan.tasks].sort(compareTaskOrder);
  const allToday = sortedTasks.filter((task) => task.date === todayKey);
  const completedTasks = allToday
    .filter((task) => isTaskCompleted(task.status))
    .sort((left, right) => `${left.startTime}`.localeCompare(`${right.startTime}`))
    .map((task) => toTodoTaskSlice(task, false));

  const overdueTasks = sortedTasks
    .filter((task) => {
      if (isTaskCompleted(task.status) || task.status === "cancelled") return false;
      const endStamp = `${task.date}T${task.endTime}:00.000Z`;
      return task.date < todayKey || (task.date === todayKey && endStamp < nowIso);
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

  const actionableToday = orderedToday.filter((task) => !isTaskCompleted(task.status));
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
