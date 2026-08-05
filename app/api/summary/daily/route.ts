import type { DailyFeedbackAnswers } from "../../../../features/summary/summary-types";
import { findUserByCookieHeader } from "../../../../lib/auth";
import {
  buildFeedbackSystemContext,
  getFeedbackPageSnapshot,
  getShanghaiDateKey,
  isValidFeedbackDate,
  saveDailyFeedback,
} from "../../../../lib/daily-feedback";
import { generateDailyFeedbackAnalysis } from "../../../../lib/daily-feedback-generator";
import { appendJournalEntry } from "../../../../lib/journal-store";
import { AIProviderError } from "../../../../lib/openai";
import { getLatestStudyPlan } from "../../../../lib/study-plan/store";
import { reserveAIRequest } from "../../../../lib/ai-store";

const FEEDBACK_GENERATIONS_PER_HOUR = 8;

type DailyFeedbackPayload = {
  [Key in keyof DailyFeedbackAnswers]?: unknown;
};

function textValue(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function parseAnswers(payload: DailyFeedbackPayload): DailyFeedbackAnswers | Response {
  const feedbackDate = textValue(payload.feedbackDate, 10);
  const energyLevel = Number(payload.energyLevel);
  const focusLevel = Number(payload.focusLevel);
  const actualStudyMinutes = payload.actualStudyMinutes === null ||
    payload.actualStudyMinutes === undefined ||
    payload.actualStudyMinutes === ""
    ? null
    : Number(payload.actualStudyMinutes);
  const quickSelections = Array.isArray(payload.quickSelections)
    ? payload.quickSelections
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  if (!isValidFeedbackDate(feedbackDate) || feedbackDate !== getShanghaiDateKey()) {
    return Response.json({ error: "只能提交今天的反馈总结。" }, { status: 400 });
  }
  if (!Number.isInteger(energyLevel) || energyLevel < 1 || energyLevel > 5 ||
    !Number.isInteger(focusLevel) || focusLevel < 1 || focusLevel > 5) {
    return Response.json({ error: "请选择 1 到 5 之间的精力和专注度。" }, { status: 400 });
  }
  if (actualStudyMinutes !== null &&
    (!Number.isInteger(actualStudyMinutes) || actualStudyMinutes < 0 || actualStudyMinutes > 24 * 60)) {
    return Response.json({ error: "实际学习时长需要在 0 到 1440 分钟之间。" }, { status: 400 });
  }

  return {
    feedbackDate,
    energyLevel,
    focusLevel,
    actualStudyMinutes,
    quickSelections,
    difficultyNotes: textValue(payload.difficultyNotes, 2_000),
    incompleteReason: textValue(payload.incompleteReason, 2_000),
    unclearKnowledge: textValue(payload.unclearKnowledge, 2_000),
    tomorrowChanges: textValue(payload.tomorrowChanges, 2_000),
    tomorrowPriority: textValue(payload.tomorrowPriority, 1_000),
    additionalNotes: textValue(payload.additionalNotes, 3_000),
  };
}

function providerError(error: AIProviderError) {
  if (error.code === "AI_NOT_CONFIGURED") {
    return Response.json({ error: "AI 服务尚未配置，反馈内容没有被提交。" }, { status: 503 });
  }
  if (error.code === "AI_CREDITS_EXHAUSTED") {
    return Response.json({ error: "AI 服务额度不足，反馈内容没有被提交。" }, { status: 503 });
  }
  if (error.code === "AI_RATE_LIMITED" || error.status === 429) {
    return Response.json({ error: "AI 当前请求较多，请稍后重新提交。" }, { status: 429 });
  }
  return Response.json({ error: "AI 暂时无法完成今日分析，请稍后重试。" }, { status: 502 });
}

export async function GET(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  const requestedDate = new URL(request.url).searchParams.get("date") ?? getShanghaiDateKey();
  if (!isValidFeedbackDate(requestedDate) || requestedDate > getShanghaiDateKey()) {
    return Response.json({ error: "反馈日期不正确。" }, { status: 400 });
  }
  try {
    const snapshot = await getFeedbackPageSnapshot(user.id, requestedDate);
    return Response.json(
      { snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to read daily feedback", error);
    return Response.json({ error: "暂时无法读取反馈总结。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  let payload: DailyFeedbackPayload;
  try {
    payload = (await request.json()) as DailyFeedbackPayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }
  const answers = parseAnswers(payload);
  if (answers instanceof Response) return answers;

  try {
    const reserved = await reserveAIRequest({
      userId: user.id,
      module: "summary",
      limit: FEEDBACK_GENERATIONS_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    });
    if (!reserved) {
      return Response.json(
        { error: "本小时的反馈分析次数已达到上限，请稍后继续。" },
        { status: 429 },
      );
    }
    const [context, plan] = await Promise.all([
      buildFeedbackSystemContext(user.id, answers.feedbackDate),
      getLatestStudyPlan(user.id),
    ]);
    const generated = await generateDailyFeedbackAnalysis({
      userId: user.id,
      answers,
      context,
      plan,
    });
    const feedback = await saveDailyFeedback({
      userId: user.id,
      answers,
      context,
      analysis: generated.analysis,
      model: generated.model,
      plan,
    });
    await appendJournalEntry(user.id, {
      id: `daily-feedback-${feedback.id}-submitted`,
      eventName: "DailyFeedbackCompleted",
      actorType: "user",
      actorLabel: "你",
      module: "summary",
      moduleLabel: "反馈总结",
      action: "feedback_completed",
      actionLabel: "提交反馈",
      title: "完成今日反馈总结",
      summary: generated.analysis.headline,
      reason: "用户提交结构化反馈，AI 已生成分析与待确认调整建议。",
      relatedObject: {
        type: "feedback",
        id: feedback.id,
        label: `${answers.feedbackDate} 反馈总结`,
        href: `/summary?date=${answers.feedbackDate}`,
      },
      changes: [
        { field: "反馈状态", before: "待填写", after: "已完成分析" },
        {
          field: "待确认调整",
          before: "0 项",
          after: `${generated.analysis.adjustments.length} 项`,
        },
      ],
      undoable: false,
    });
    const snapshot = await getFeedbackPageSnapshot(user.id, answers.feedbackDate);
    return Response.json(
      { snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AIProviderError) return providerError(error);
    if (error instanceof Error && error.message === "FEEDBACK_PLAN_CHANGED") {
      return Response.json(
        { error: "AI 分析期间 Timeline 或 Todo 发生了变化，请刷新后重新生成。" },
        { status: 409 },
      );
    }
    console.error("Failed to generate daily feedback", error);
    return Response.json({ error: "反馈总结暂时没有保存成功，请稍后重试。" }, { status: 500 });
  }
}
