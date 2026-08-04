import "server-only";

import type {
  JournalDataAdapter,
  JournalEntry,
  JournalSnapshot,
} from "./journal-types";
import { listJournalEntries } from "../../lib/journal-store";

export const JOURNAL_EVENT_CATALOG = {
  TaskCreated: "task_created",
  TaskUpdated: "task_updated",
  TaskDeleted: "task_deleted",
  TaskStarted: "task_started",
  TaskPaused: "task_paused",
  TaskCompleted: "task_completed",
  TaskDelayed: "task_delayed",
  TimelineAdjusted: "plan_adjusted",
  AdjustmentAccepted: "adjustment_accepted",
  AdjustmentRejected: "adjustment_rejected",
  DailyFeedbackCompleted: "feedback_completed",
  TutorSessionCompleted: "tutor_session_completed",
  MasteryChanged: "mastery_changed",
  MembershipChanged: "membership_changed",
  AccountRegistered: "account_registered",
  AccountSignedIn: "account_signed_in",
  AccountSignedOut: "account_signed_out",
  AccountProfileUpdated: "account_profile_updated",
  AccountSecurityChanged: "account_security_changed",
  LearningProfileUpdated: "learning_profile_updated",
  CorrectionRecorded: "correction_recorded",
} as const;

function atOffset(daysAgo: number, hours: number, minutes: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(Date.UTC(read("year"), read("month") - 1, read("day") - daysAgo, hours - 8, minutes)).toISOString();
}

function placeholderEntries(): Promise<JournalEntry[]> {
  return Promise.resolve([
    {
      id: "log-task-completed-physics",
      eventName: "TaskCompleted",
      occurredAt: atOffset(0, 19, 36),
      actorType: "user",
      actorLabel: "你",
      module: "todo",
      moduleLabel: "Todo",
      action: "task_completed",
      actionLabel: "完成任务",
      title: "完成「平抛运动代表题」",
      summary: "任务按计划完成，实际用时比预计多 3 分钟。",
      reason: "用户勾选完成并提交实际用时。",
      relatedObject: { type: "task", id: "task-physics-projectile", label: "物理 · 平抛运动代表题", href: "/todo?task=task-physics-projectile" },
      changes: [
        { field: "任务状态", before: "进行中", after: "已完成" },
        { field: "实际用时", before: "—", after: "18 分钟" },
        { field: "完成质量", before: "—", after: "基本掌握" },
      ],
      undoable: true,
    },
    {
      id: "log-plan-adjusted-evening",
      eventName: "TimelineAdjusted",
      occurredAt: atOffset(0, 18, 42),
      actorType: "system",
      actorLabel: "知序系统",
      module: "timeline",
      moduleLabel: "Timeline",
      action: "plan_adjusted",
      actionLabel: "自动调整",
      title: "生成今晚的最小调整方案",
      summary: "因实验报告占用 60 分钟，系统重新计算剩余任务，但尚未写入权威计划。",
      reason: "今晚可用时间从 90 分钟减少为 30 分钟。",
      relatedObject: { type: "plan", id: "plan-midterm-v12-draft", label: "期中备考计划 · 待确认方案", href: "/timeline?view=adjustments" },
      changes: [
        { field: "物理练习", before: "30 分钟", after: "15 分钟" },
        { field: "英语听力", before: "今晚 20:10", after: "明天 19:00" },
        { field: "睡眠时间", before: "22:30", after: "22:30（保持不变）" },
      ],
      undoable: false,
    },
    {
      id: "log-task-delayed-english",
      eventName: "TaskDelayed",
      occurredAt: atOffset(0, 18, 38),
      actorType: "user",
      actorLabel: "你",
      module: "todo",
      moduleLabel: "Todo",
      action: "task_delayed",
      actionLabel: "延期任务",
      title: "英语听力延期到明天",
      summary: "任务未开始，已提交延期原因并等待 Timeline 重新排期。",
      reason: "临时增加实验报告，今晚可用时间不足。",
      relatedObject: { type: "task", id: "task-english-listening", label: "英语 · 必修二听力训练", href: "/todo?task=task-english-listening" },
      changes: [
        { field: "计划时间", before: "今天 20:10", after: "待 Timeline 确认" },
        { field: "任务状态", before: "待开始", after: "已延期" },
      ],
      undoable: true,
    },
    {
      id: "log-task-started-physics",
      eventName: "TaskStarted",
      occurredAt: atOffset(0, 19, 18),
      actorType: "user",
      actorLabel: "你",
      module: "todo",
      moduleLabel: "Todo",
      action: "task_started",
      actionLabel: "开始任务",
      title: "开始「平抛运动代表题」",
      summary: "计时器开始，任务进入执行状态。",
      reason: "用户从今日 Todo 启动任务。",
      relatedObject: { type: "task", id: "task-physics-projectile", label: "物理 · 平抛运动代表题", href: "/todo?task=task-physics-projectile" },
      changes: [{ field: "任务状态", before: "待开始", after: "进行中" }],
      undoable: false,
    },
    {
      id: "log-feedback-yesterday",
      eventName: "DailyFeedbackCompleted",
      occurredAt: atOffset(1, 21, 27),
      actorType: "user",
      actorLabel: "你",
      module: "summary",
      moduleLabel: "反馈总结",
      action: "feedback_completed",
      actionLabel: "提交反馈",
      title: "完成昨日反馈总结",
      summary: "记录了两个未完成任务、一项新增安排和物理复习卡点。",
      reason: "用户完成每日结构化反馈。",
      relatedObject: { type: "feedback", id: "feedback-yesterday", label: "昨日反馈总结", href: "/summary?date=yesterday" },
      changes: [
        { field: "反馈状态", before: "待完成", after: "已完成" },
        { field: "调整建议", before: "—", after: "4 项待确认" },
      ],
      undoable: false,
    },
    {
      id: "log-tutor-session",
      eventName: "TutorSessionCompleted",
      occurredAt: atOffset(1, 20, 6),
      actorType: "ai",
      actorLabel: "AI Tutor",
      module: "ai-tutor",
      moduleLabel: "AI Tutor",
      action: "tutor_session_completed",
      actionLabel: "答疑结束",
      title: "结束一次函数单调性答疑",
      summary: "对话共 8 轮，生成 2 道相似题，用户标记回答有帮助。",
      reason: "用户结束本次答疑会话。",
      relatedObject: { type: "conversation", id: "conversation-function-monotonicity", label: "数学 · 函数单调性答疑", href: "/ai-tutor?conversation=conversation-function-monotonicity" },
      changes: [
        { field: "答疑状态", before: "进行中", after: "已结束" },
        { field: "学习信号", before: "—", after: "基础概念仍需巩固" },
      ],
      undoable: false,
    },
    {
      id: "log-mastery-changed",
      eventName: "MasteryChanged",
      occurredAt: atOffset(2, 20, 34),
      actorType: "system",
      actorLabel: "知序系统",
      module: "insights",
      moduleLabel: "进展洞察",
      action: "mastery_changed",
      actionLabel: "掌握度变化",
      title: "平抛运动掌握度上升",
      summary: "根据连续三次任务完成质量重新计算知识点掌握度。",
      reason: "最近三次练习均达到完成标准。",
      relatedObject: { type: "subject", id: "knowledge-projectile", label: "物理 · 平抛运动", href: "/insights?knowledge=knowledge-projectile" },
      changes: [{ field: "掌握程度", before: "58%", after: "66%" }],
      undoable: false,
    },
    {
      id: "log-adjustment-accepted",
      eventName: "AdjustmentAccepted",
      occurredAt: atOffset(3, 21, 11),
      actorType: "user",
      actorLabel: "你",
      module: "timeline",
      moduleLabel: "Timeline",
      action: "adjustment_accepted",
      actionLabel: "接受调整",
      title: "接受第 11 版计划调整",
      summary: "两项任务移动、一项任务拆分，Timeline 已生成新版本。",
      reason: "用户确认反馈总结生成的调整清单。",
      relatedObject: { type: "plan", id: "plan-midterm-v11", label: "期中备考计划 · 第 11 版", href: "/timeline?version=11" },
      changes: [
        { field: "计划版本", before: "第 10 版", after: "第 11 版" },
        { field: "受影响任务", before: "0 项", after: "3 项" },
      ],
      undoable: true,
    },
    {
      id: "log-account-signin",
      eventName: "AccountSignedIn",
      occurredAt: atOffset(4, 17, 52),
      actorType: "user",
      actorLabel: "你",
      module: "auth",
      moduleLabel: "账号安全",
      action: "account_signed_in",
      actionLabel: "账号登录",
      title: "新登录会话已建立",
      summary: "通过手机号和密码登录知序。敏感信息不会写入日志。",
      reason: "账号验证成功。",
      relatedObject: { type: "account", id: "current-account", label: "登录设备与账号安全", href: "/profile" },
      changes: [{ field: "会话状态", before: "未登录", after: "已登录" }],
      undoable: false,
    },
  ]);
}

export const placeholderJournalAdapter: JournalDataAdapter = {
  listEntries: placeholderEntries,
};

export function createD1JournalAdapter(userId: string): JournalDataAdapter {
  return {
    listEntries: () => listJournalEntries(userId),
  };
}

export async function getJournalSnapshot(
  adapter: JournalDataAdapter = placeholderJournalAdapter,
): Promise<JournalSnapshot> {
  const entries = await adapter.listEntries();

  return {
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    entries: entries.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  };
}
