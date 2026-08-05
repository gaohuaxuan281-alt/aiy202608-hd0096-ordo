import "server-only";

import { SUBJECTS } from "../../config/learning-catalog";
import {
  formatExamDate,
  formatExamUnitRange,
  getDaysUntilExam,
} from "../../lib/exam-plan";
import type { LearningProfile } from "../../lib/learning-profile";
import type {
  HomeDashboardAdapters,
  HomeDashboardSnapshot,
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
  recentChanges: "timeline+journal",
  pendingAdjustments: "timeline",
  todayProgress: "todo",
  subjectProgress: "insights",
  tutorEntry: "ai-tutor",
  feedbackReminder: "summary",
} as const;

function placeholderTimeline(): Promise<HomeTimelineSlice> {
  const examDate = new Date();
  examDate.setDate(examDate.getDate() + 8);
  examDate.setHours(9, 0, 0, 0);

  return Promise.resolve({
    exam: {
      id: "exam-placeholder-midterm",
      name: "高二上学期期中考试",
      startsAt: examDate.toISOString(),
      dateLabel: new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(examDate),
      daysRemaining: 8,
      planStatusLabel: "动态计划已同步",
    },
    nextTask: {
      id: "task-placeholder-physics",
      subject: "物理",
      title: "独立完成平抛运动 2 题",
      timeLabel: "19:20–19:35",
      durationMinutes: 15,
      status: "in_progress",
      statusLabel: "进行中",
      completionCriteria: "完成解题并标记每一步受力与速度方向",
      sourceLabel: "从原任务拆分",
    },
    risk: {
      id: "risk-placeholder-timeout",
      level: "high",
      title: "物理任务连续两次超时",
      description: "若今晚继续超时，明天的数学复习会被压缩 20 分钟。",
      actionLabel: "检查任务",
      actionHref: "/todo",
    },
    recentChanges: [
      {
        id: "change-placeholder-1",
        happenedAtLabel: "18:42",
        title: "实验报告占用晚间学习时间",
        description: "可用时间由 90 分钟降为 30 分钟，系统生成最小调整建议。",
        actorLabel: "系统建议",
        href: "/timeline",
      },
      {
        id: "change-placeholder-2",
        happenedAtLabel: "昨天",
        title: "英语词汇任务提前完成",
        description: "释放 15 分钟缓冲时间，暂未写入其他科目。",
        actorLabel: "Todo 同步",
        href: "/journal",
      },
      {
        id: "change-placeholder-3",
        happenedAtLabel: "周一",
        title: "数学函数复习被拆分",
        description: "一个 50 分钟任务拆为两个 25 分钟任务。",
        actorLabel: "用户确认",
        href: "/timeline",
      },
    ],
    pendingAdjustments: [
      {
        id: "adjustment-placeholder-1",
        title: "物理练习缩短为 15 分钟",
        description: "只保留两道代表题，错题整理移到明天。",
        impactLabel: "今晚",
      },
      {
        id: "adjustment-placeholder-2",
        title: "英语听力移动到明天",
        description: "避免压缩睡眠时间，优先保留当前薄弱科目。",
        impactLabel: "+1 天",
      },
      {
        id: "adjustment-placeholder-3",
        title: "新增 10 分钟缓冲",
        description: "为任务切换和记录实际用时预留空间。",
        impactLabel: "+10 分钟",
      },
    ],
    weeklyAdjustmentCount: 3,
  });
}

function placeholderTodo(): Promise<HomeTodoSlice> {
  return Promise.resolve({
    today: {
      completedTasks: 5,
      totalTasks: 7,
      completionPercent: 71,
      completedMinutes: 90,
      plannedMinutes: 150,
      remainingAvailableMinutes: 30,
      originalAvailableMinutes: 90,
    },
  });
}

function placeholderTutor(): Promise<HomeTutorSlice> {
  return Promise.resolve({
    quickPrompts: [
      "帮我检查下一项任务的知识点",
      "给我一个 15 分钟启动提示",
      "解释我今天最大的学习风险",
    ],
  });
}

function placeholderSummary(): Promise<HomeSummarySlice> {
  return Promise.resolve({
    feedback: {
      status: "pending",
      title: "今晚还有一份反馈总结",
      description: "完成后，AI 会结合今日执行情况生成明天的调整建议。",
      dueLabel: "建议 21:30 前完成",
      questionsRemaining: 4,
    },
  });
}

function placeholderInsights(): Promise<HomeInsightsSlice> {
  return Promise.resolve({
    overallStatusLabel: "总体按计划推进",
    subjects: [
      { id: "subject-math", subject: "数学", completionPercent: 82, completedMinutes: 210, plannedMinutes: 255, trendLabel: "+8%", riskLabel: "稳定", tone: "indigo" },
      { id: "subject-physics", subject: "物理", completionPercent: 64, completedMinutes: 145, plannedMinutes: 225, trendLabel: "-4%", riskLabel: "需关注", tone: "amber" },
      { id: "subject-english", subject: "英语", completionPercent: 76, completedMinutes: 170, plannedMinutes: 225, trendLabel: "+3%", riskLabel: "正常", tone: "teal" },
      { id: "subject-chinese", subject: "语文", completionPercent: 58, completedMinutes: 105, plannedMinutes: 180, trendLabel: "+1%", riskLabel: "待补齐", tone: "rose" },
    ],
  });
}

export const placeholderHomeAdapters: HomeDashboardAdapters = {
  timeline: placeholderTimeline,
  todo: placeholderTodo,
  tutor: placeholderTutor,
  summary: placeholderSummary,
  insights: placeholderInsights,
};

function applyExamPlan(
  timeline: HomeTimelineSlice,
  examPlan: LearningProfile | null,
): HomeTimelineSlice {
  if (!examPlan?.examDate) return timeline;
  const subjectLabels = examPlan.subjects.map((item) => SUBJECTS[item.subject].label);
  const firstSubject = examPlan.subjects[0];
  const firstRange = firstSubject
    ? formatExamUnitRange(firstSubject.subject, firstSubject.examUnitStart, firstSubject.examUnitEnd)
    : "考试范围";

  return {
    ...timeline,
    exam: {
      id: "exam-learning-profile",
      name: subjectLabels.length === 1 ? `${subjectLabels[0]}考试` : `${subjectLabels.join("、")}考试`,
      startsAt: `${examPlan.examDate}T09:00:00+08:00`,
      dateLabel: formatExamDate(examPlan.examDate),
      daysRemaining: getDaysUntilExam(examPlan.examDate),
      planStatusLabel: "考试范围已同步",
    },
    nextTask: firstSubject
      ? {
          ...timeline.nextTask,
          subject: SUBJECTS[firstSubject.subject].label,
          title: `复习 ${firstRange} 核心内容`,
          completionCriteria: `覆盖${firstRange}，标记仍未掌握的知识点`,
          sourceLabel: "由考试范围生成",
        }
      : timeline.nextTask,
  };
}

export async function getHomeDashboardSnapshot(
  {
    adapters = placeholderHomeAdapters,
    examPlan = null,
  }: {
    adapters?: HomeDashboardAdapters;
    examPlan?: LearningProfile | null;
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
    timeline: applyExamPlan(timeline, examPlan),
    todo,
    tutor,
    summary,
    insights,
  };
}
