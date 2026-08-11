import {
  getGrade,
  getTextbookLabel,
  SUBJECTS,
} from "../../../../config/learning-catalog";
import { findUserByCookieHeader } from "../../../../lib/auth";
import {
  createStudyPlanProfileFingerprint,
  getLatestCompletedDiagnosticQuiz,
  hasCompletedDiagnosticQuizForProfile,
} from "../../../../lib/diagnostic-quiz";
import { formatExamUnitRange, getDaysUntilExam } from "../../../../lib/exam-plan";
import {
  getLearningProfile,
  hasCompleteExamPlan,
} from "../../../../lib/learning-profile";
import { buildInitialStudyPlanInput } from "../../../../lib/initial-study-plan";
import { AIProviderError, requestOpenAIStructuredResponse } from "../../../../lib/openai";
import { getUserProfile } from "../../../../lib/profile";
import {
  buildFallbackStudyPlan,
  buildTimelineGenerationInstructions,
  parseStudyPlanFromAI,
  TIMELINE_PLAN_JSON_SCHEMA,
} from "../../../../lib/study-plan/generator";
import {
  completeStudyPlanGeneration,
  failStudyPlanGeneration,
  getStudyPlans,
  reserveStudyPlanGeneration,
  saveStudyPlan,
} from "../../../../lib/study-plan/store";
import type { StudyPlanGenerationInput } from "../../../../lib/study-plan/types";

const MIN_DAILY_MINUTES = 30;
const MAX_DAILY_MINUTES = 12 * 60;
const ONBOARDING_GENERATION_LEASE_MS = 10 * 60 * 1000;

type TimelinePlanRequest = Partial<StudyPlanGenerationInput> & {
  source?: unknown;
};

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

async function createOnboardingGenerationKey({
  userId,
  profileFingerprint,
  diagnosticAttemptId,
}: {
  userId: string;
  profileFingerprint: string;
  diagnosticAttemptId: string;
}) {
  const encoded = new TextEncoder().encode(
    [userId, profileFingerprint, diagnosticAttemptId].join("\0"),
  );
  const source = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength,
  ) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `onboarding-timeline:v3:${hash}`;
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
  return requestOpenAIStructuredResponse({
    userId,
    instructions: `你是 JSON 修复器。你的唯一任务是把用户提供的 Timeline 计划文本修复为合法 JSON。

要求：
1. 只输出合法 JSON。
2. 不要补充产品说明，不要输出 Markdown。
3. 保留原始语义，缺失字段只做最小补全。
4. 输出必须满足给定 schema。`,
    message: `请修复下面这段可能被截断、含非法换行或格式错误的 Timeline JSON，并只返回修复后的合法 JSON：\n\n${rawText}`,
    schemaName: "timeline_plan_repair",
    schema: TIMELINE_PLAN_JSON_SCHEMA as Record<string, unknown>,
    maxOutputTokens: 3_000,
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
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return badRequest("请求格式不正确。");
  }

  let onboardingContext: {
    profile: NonNullable<Awaited<ReturnType<typeof getLearningProfile>>>;
    diagnosticResult: NonNullable<
      Awaited<ReturnType<typeof getLatestCompletedDiagnosticQuiz>>
    >;
    generationKey: string;
  } | null = null;
  let input: StudyPlanGenerationInput | Response;
  if (payload.source === "onboarding") {
    const [profile, diagnosticResult] = await Promise.all([
      getLearningProfile(user.id),
      getLatestCompletedDiagnosticQuiz(user.id),
    ]);
    if (!hasCompleteExamPlan(profile)) {
      return Response.json(
        { error: "请先补充完整的考试信息和每日学习时段。" },
        { status: 400 },
      );
    }
    if (
      !diagnosticResult ||
      !hasCompletedDiagnosticQuizForProfile(profile, diagnosticResult)
    ) {
      return Response.json(
        { error: "请先完成与当前考试范围匹配的诊断 Quiz。" },
        { status: 409 },
      );
    }
    const fingerprint = createStudyPlanProfileFingerprint(profile);
    onboardingContext = {
      profile,
      diagnosticResult,
      generationKey: await createOnboardingGenerationKey({
        userId: user.id,
        profileFingerprint: fingerprint,
        diagnosticAttemptId: diagnosticResult.attemptId,
      }),
    };
    input = buildInitialStudyPlanInput(profile);
  } else {
    input = validateInput(payload);
  }
  if (input instanceof Response) return input;

  let generationLease: {
    generationKey: string;
    planId: string;
    leaseToken: string;
  } | null = null;

  try {
    const [learningProfile, userProfile, diagnosticResult] = await Promise.all([
      onboardingContext
        ? Promise.resolve(onboardingContext.profile)
        : getLearningProfile(user.id),
      getUserProfile(user.id),
      onboardingContext
        ? Promise.resolve(onboardingContext.diagnosticResult)
        : getLatestCompletedDiagnosticQuiz(user.id),
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
      learningProfileFingerprint: createStudyPlanProfileFingerprint(learningProfile),
      diagnosticAttemptId: diagnosticResult?.attemptId,
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

    if (onboardingContext) {
      const reservation = await reserveStudyPlanGeneration({
        userId: user.id,
        generationKey: onboardingContext.generationKey,
        input: timelineInput,
        leaseDurationMs: ONBOARDING_GENERATION_LEASE_MS,
      });
      if (reservation.state === "completed") {
        return Response.json(
          {
            plan: reservation.plan,
            generatedBy: reservation.plan.model,
            reused: true,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (reservation.state === "pending") {
        return Response.json(
          {
            pending: true,
            retryAfterSeconds: reservation.retryAfterSeconds,
            retryAfterMs: reservation.retryAfterSeconds * 1000,
            error: "第一版 Timeline 正在生成，请稍后重试。",
          },
          {
            status: 202,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": String(reservation.retryAfterSeconds),
            },
          },
        );
      }
      generationLease = {
        generationKey: onboardingContext.generationKey,
        planId: reservation.planId,
        leaseToken: reservation.leaseToken,
      };
    }

    let plan;
    let planText = "";
    let generatedBy = "timeline-fallback";

    try {
      const aiResponse = await requestOpenAIStructuredResponse({
        userId: user.id,
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
        message: `请根据这些信息生成 ${timelineInput.examName} 的考前 Timeline。每个任务必须是 10–20 分钟优先、最多 30 分钟、可以直接照做并能量化验收的微任务，让 Todo 能从其中直接派生。`,
        schemaName: "timeline_plan",
        schema: TIMELINE_PLAN_JSON_SCHEMA as Record<string, unknown>,
        maxOutputTokens: 4_000,
      });

      generatedBy = aiResponse.model;
      planText = JSON.stringify(aiResponse.data);
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
          planText = JSON.stringify(repaired.data);
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

    const saved = generationLease
      ? await completeStudyPlanGeneration({
          userId: user.id,
          generationKey: generationLease.generationKey,
          planId: generationLease.planId,
          leaseToken: generationLease.leaseToken,
          input: timelineInput,
          plan,
          model: generatedBy,
          rawResponse: planText,
        })
      : await saveStudyPlan({
          userId: user.id,
          input: timelineInput,
          plan,
          model: generatedBy,
          rawResponse: planText,
        });

    return Response.json(
      { plan: saved, generatedBy: saved.model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (generationLease) {
      try {
        await failStudyPlanGeneration({
          userId: user.id,
          generationKey: generationLease.generationKey,
          planId: generationLease.planId,
          leaseToken: generationLease.leaseToken,
        });
      } catch (leaseError) {
        console.error("Failed to release Timeline generation lease", leaseError);
      }
    }
    if (
      error instanceof Error &&
      error.message === "STUDY_PLAN_GENERATION_LEASE_LOST"
    ) {
      return Response.json(
        {
          pending: true,
          retryAfterSeconds: 1,
          retryAfterMs: 1000,
          error: "另一项请求正在完成第一版 Timeline，请稍后重试。",
        },
        {
          status: 202,
          headers: { "Cache-Control": "no-store", "Retry-After": "1" },
        },
      );
    }
    if (error instanceof AIProviderError) return providerErrorResponse(error);
    const message = error instanceof Error ? error.message : "Timeline 生成失败。";
    console.error("Failed to generate study plan", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
