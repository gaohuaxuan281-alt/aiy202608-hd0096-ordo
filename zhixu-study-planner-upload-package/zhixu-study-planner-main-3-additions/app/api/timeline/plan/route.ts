import {
  getGrade,
  getTextbookLabel,
  SUBJECTS,
} from "../../../../config/learning-catalog";
import { findUserByCookieHeader } from "../../../../lib/auth";
import { getLatestCompletedDiagnosticQuiz } from "../../../../lib/diagnostic-quiz";
import { formatExamUnitRange, getDaysUntilExam } from "../../../../lib/exam-plan";
import { getLearningProfile } from "../../../../lib/learning-profile";
import { AIProviderError, requestOpenAIResponse } from "../../../../lib/openai";
import { getUserProfile } from "../../../../lib/profile";
import {
  buildFallbackStudyPlan,
  buildTimelineGenerationInstructions,
  parseStudyPlanFromAI,
  TIMELINE_PLAN_JSON_SCHEMA,
} from "../../../../lib/study-plan-ai";
import { getStudyPlans, saveStudyPlan } from "../../../../lib/study-plan-store";
import type { StudyPlanGenerationInput } from "../../../../lib/study-plan-types";

const MIN_DAILY_MINUTES = 30;
const MAX_DAILY_MINUTES = 12 * 60;

type TimelinePlanRequest = Partial<StudyPlanGenerationInput>;

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function providerErrorResponse(error: AIProviderError) {
  if (error.code === "AI_NOT_CONFIGURED") {
    return Response.json(
      { error: "AI 提供商还没有完成配置，请先补充服务端密钥。", code: error.code },
      { status: 503 },
    );
  }

  if (error.code === "AI_CREDITS_EXHAUSTED") {
    return Response.json(
      { error: "当前 AI 服务额度不足，请联系管理员补充额度。", code: error.code },
      { status: 503 },
    );
  }

  if (error.code === "AI_PROVIDER_UNAUTHORIZED") {
    return Response.json(
      { error: "当前 AI 服务密钥无效或已过期，请检查服务端配置。", code: error.code },
      { status: 503 },
    );
  }

  if (error.code === "AI_RATE_LIMITED" || error.status === 429) {
    return Response.json(
      { error: "AI 当前比较忙，请稍后再试。", code: "AI_RATE_LIMITED" },
      { status: 429 },
    );
  }

  return Response.json(
    { error: "Timeline 生成失败，请稍后重试。", code: error.code },
    { status: 502 },
  );
}

function validateInput(payload: TimelinePlanRequest): StudyPlanGenerationInput | Response {
  const examName = typeof payload.examName === "string" ? payload.examName.trim() : "";
  const examDate = typeof payload.examDate === "string" ? payload.examDate.trim() : "";
  const targetScore = typeof payload.targetScore === "string" ? payload.targetScore.trim() : "";
  const preferredStartTime = typeof payload.preferredStartTime === "string"
    ? payload.preferredStartTime.trim()
    : "";
  const unavailableWindows = typeof payload.unavailableWindows === "string"
    ? payload.unavailableWindows.trim()
    : "";
  const fixedCommitments = typeof payload.fixedCommitments === "string"
    ? payload.fixedCommitments.trim()
    : "";
  const mustKeepBoundaries = typeof payload.mustKeepBoundaries === "string"
    ? payload.mustKeepBoundaries.trim()
    : "";
  const focusStrategy = typeof payload.focusStrategy === "string" ? payload.focusStrategy.trim() : "";
  const extraContext = typeof payload.extraContext === "string" ? payload.extraContext.trim() : "";
  const dailyAvailableMinutes = typeof payload.dailyAvailableMinutes === "number"
    ? Math.round(payload.dailyAvailableMinutes)
    : Number.NaN;

  if (examName.length < 2 || examName.length > 40) {
    return badRequest("考试名称需要在 2 到 40 个字符之间。");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    return badRequest("请选择有效的考试日期。");
  }
  if (!/^\d{2}:\d{2}$/.test(preferredStartTime)) {
    return badRequest("请提供有效的开始学习时间。");
  }
  if (!Number.isFinite(dailyAvailableMinutes) ||
    dailyAvailableMinutes < MIN_DAILY_MINUTES ||
    dailyAvailableMinutes > MAX_DAILY_MINUTES) {
    return badRequest(`每日可用学习时间需要在 ${MIN_DAILY_MINUTES} 到 ${MAX_DAILY_MINUTES} 分钟之间。`);
  }

  return {
    examName,
    examDate,
    targetScore,
    dailyAvailableMinutes,
    preferredStartTime,
    unavailableWindows,
    fixedCommitments,
    mustKeepBoundaries,
    focusStrategy,
    extraContext,
  };
}

async function repairTimelinePlan({
  userId,
  rawText,
}: {
  userId: string;
  rawText: string;
}) {
  return requestOpenAIResponse({
    userId,
    module: "timeline",
    instructions: `你是 JSON 修复器。你的唯一任务是把用户提供的 Timeline 计划文本修复为合法 JSON。

要求：
1. 只输出合法 JSON。
2. 不要补充产品说明，不要输出 Markdown。
3. 保留原始语义，缺失字段只做最小补全。
4. 输出必须满足给定 schema。`,
    history: [],
    message: `请修复下面这段可能被截断、含非法换行或格式错误的 Timeline JSON，并只返回修复后的合法 JSON：\n\n${rawText}`,
    structuredOutput: {
      name: "timeline_plan_repair",
      schema: TIMELINE_PLAN_JSON_SCHEMA as Record<string, unknown>,
    },
  });
}

export async function GET(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  try {
    const plans = await getStudyPlans(user.id);
    return Response.json(
      {
        plan: plans[0] ?? null,
        plans,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to read study plans", error);
    return Response.json({ error: "暂时无法读取 Timeline 计划。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  let payload: TimelinePlanRequest;
  try {
    payload = (await request.json()) as TimelinePlanRequest;
  } catch {
    return badRequest("请求格式不正确。");
  }

  const input = validateInput(payload);
  if (input instanceof Response) return input;

  try {
    const [learningProfile, userProfile, diagnosticResult] = await Promise.all([
      getLearningProfile(user.id),
      getUserProfile(user.id),
      getLatestCompletedDiagnosticQuiz(user.id),
    ]);

    if (!learningProfile) {
      return Response.json(
        { error: "请先完成学习档案设置，再生成 Timeline。" },
        { status: 400 },
      );
    }

    const subjects = learningProfile.subjects.map((item) => ({
      subject: SUBJECTS[item.subject].label,
      textbook: getTextbookLabel(learningProfile.grade, item.subject, item.textbook) ?? item.textbook,
      examScope: formatExamUnitRange(item.subject, item.examUnitStart, item.examUnitEnd),
      weakTopics: (diagnosticResult?.weakTopics ?? [])
        .filter((topic) => topic.subject === item.subject)
        .map((topic) => topic.knowledgePoint),
    }));
    const quizWeakTopicSummary = diagnosticResult?.weakTopics.length
      ? diagnosticResult.weakTopics
          .slice(0, 6)
          .map((item) => `${item.subjectLabel}${item.unitLabel}·${item.knowledgePoint}`)
          .join("；")
      : "";
    const timelineInput: StudyPlanGenerationInput = {
      ...input,
      examDate: learningProfile.examDate ?? input.examDate,
      extraContext: [
        input.extraContext,
        learningProfile.examDate
          ? `学习档案考试日期：${learningProfile.examDate}（还有 ${getDaysUntilExam(learningProfile.examDate)} 天）。`
          : "",
        `考试范围：${subjects.map((item) => `${item.subject}${item.examScope}`).join("；")}`,
        quizWeakTopicSummary ? `诊断薄弱点：${quizWeakTopicSummary}` : "",
      ].filter(Boolean).join("\n"),
    };

    let plan;
    let planText = "";
    let generatedBy = "timeline-fallback";

    try {
      const aiResponse = await requestOpenAIResponse({
        userId: user.id,
        module: "timeline",
        instructions: buildTimelineGenerationInstructions({
          displayName: userProfile.displayName,
          userProfile: {
            ...userProfile,
            studyStage: getGrade(learningProfile.grade).label,
          },
          learningProfile,
          subjects,
          input: timelineInput,
          diagnosticWeakTopics: diagnosticResult?.weakTopics ?? [],
        }),
        history: [],
        message: `请根据这些信息生成 ${timelineInput.examName} 的考前 Timeline，并让 Todo 能从其中直接派生。`,
        structuredOutput: {
          name: "timeline_plan",
          schema: TIMELINE_PLAN_JSON_SCHEMA as Record<string, unknown>,
        },
      });

      generatedBy = aiResponse.model;
      planText = aiResponse.text;
      plan = parseStudyPlanFromAI({
        rawText: planText,
        examName: timelineInput.examName,
        examDate: timelineInput.examDate,
        targetScore: timelineInput.targetScore,
        preferredStartTime: timelineInput.preferredStartTime,
        dailyAvailableMinutes: timelineInput.dailyAvailableMinutes,
      });
    } catch (error) {
      if (planText) {
        console.error("Timeline raw AI response preview", planText.slice(0, 1200));
        try {
          const repaired = await repairTimelinePlan({ userId: user.id, rawText: planText });
          planText = repaired.text;
          plan = parseStudyPlanFromAI({
            rawText: planText,
            examName: timelineInput.examName,
            examDate: timelineInput.examDate,
            targetScore: timelineInput.targetScore,
            preferredStartTime: timelineInput.preferredStartTime,
            dailyAvailableMinutes: timelineInput.dailyAvailableMinutes,
          });
          generatedBy = `${generatedBy}-repair`;
        } catch (repairError) {
          console.error("Timeline repair failed, falling back to local plan", repairError);
          plan = buildFallbackStudyPlan({
            examName: timelineInput.examName,
            examDate: timelineInput.examDate,
            targetScore: timelineInput.targetScore,
            preferredStartTime: timelineInput.preferredStartTime,
            dailyAvailableMinutes: timelineInput.dailyAvailableMinutes,
            subjects,
            diagnosticWeakTopics: diagnosticResult?.weakTopics ?? [],
          });
          planText = JSON.stringify(plan);
          generatedBy = `${generatedBy}-fallback`;
        }
      } else {
        console.error("Timeline AI request failed, falling back to local plan", error);
        plan = buildFallbackStudyPlan({
          examName: timelineInput.examName,
          examDate: timelineInput.examDate,
          targetScore: timelineInput.targetScore,
          preferredStartTime: timelineInput.preferredStartTime,
          dailyAvailableMinutes: timelineInput.dailyAvailableMinutes,
          subjects,
          diagnosticWeakTopics: diagnosticResult?.weakTopics ?? [],
        });
        planText = JSON.stringify(plan);
      }
    }

    const saved = await saveStudyPlan({
      userId: user.id,
      input: timelineInput,
      plan,
      model: generatedBy,
      rawResponse: planText,
    });

    return Response.json(
      { plan: saved, generatedBy },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AIProviderError) return providerErrorResponse(error);
    const message = error instanceof Error ? error.message : "Timeline 生成失败。";
    console.error("Failed to generate study plan", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
