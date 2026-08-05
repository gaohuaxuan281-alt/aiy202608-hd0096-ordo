import { findUserByCookieHeader } from "../../../../../lib/auth";
import {
  countRecentDiagnosticQuizAttempts,
  saveGeneratedDiagnosticQuiz,
} from "../../../../../lib/diagnostic-quiz";
import {
  DIAGNOSTIC_QUIZ_SCHEMA,
  buildDiagnosticCoverageSummary,
  buildDiagnosticCoverageTargets,
  buildDiagnosticQuizPrompt,
  validateGeneratedDiagnosticQuiz,
  type ModelQuizPayload,
} from "../../../../../lib/diagnostic-quiz-generator";
import { parseLearningProfileInput } from "../../../../../lib/learning-profile-input";
import {
  AIProviderError,
  requestOpenAIStructuredResponse,
} from "../../../../../lib/openai";

const QUIZ_GENERATIONS_PER_HOUR = 6;

function providerErrorResponse(error: AIProviderError) {
  if (error.code === "AI_NOT_CONFIGURED") {
    return Response.json({ error: "Quiz AI 尚未完成配置，请联系管理员。" }, { status: 503 });
  }
  if (error.code === "AI_CREDITS_EXHAUSTED") {
    return Response.json({ error: "AI 服务额度不足，请联系管理员补充额度。" }, { status: 503 });
  }
  if (error.status === 429 || error.code === "AI_RATE_LIMITED") {
    return Response.json({ error: "Quiz 生成请求较多，请稍后再试。" }, { status: 429 });
  }
  return Response.json({ error: "Quiz 暂时没有生成成功，请重试。" }, { status: 502 });
}

export async function POST(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }
  const profilePayload = payload && typeof payload === "object"
    ? (payload as { profile?: unknown }).profile
    : null;
  const parsed = parseLearningProfileInput(profilePayload);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const profile = parsed.value;

  try {
    const recentAttempts = await countRecentDiagnosticQuizAttempts(
      user.id,
      Date.now() - 60 * 60 * 1000,
    );
    if (recentAttempts >= QUIZ_GENERATIONS_PER_HOUR) {
      return Response.json(
        { error: "本小时已生成多次 Quiz，请稍后继续。" },
        { status: 429 },
      );
    }

    const targets = buildDiagnosticCoverageTargets(profile);
    const generated = await requestOpenAIStructuredResponse<ModelQuizPayload>({
      userId: user.id,
      schemaName: "zhixu_diagnostic_quiz",
      schema: DIAGNOSTIC_QUIZ_SCHEMA,
      instructions: `你是知序的考前诊断题设计器。你要根据学生的中国教材版本、年级和考试 Unit 范围生成原创选择题。严格遵守 JSON Schema 和逐题覆盖位置，不输出额外文字。`,
      message: buildDiagnosticQuizPrompt(profile, targets),
    });
    const questions = validateGeneratedDiagnosticQuiz(generated.data, targets);
    if (!questions) {
      return Response.json(
        { error: "AI 生成的 Quiz 没有通过质量检查，请重新生成。" },
        { status: 502 },
      );
    }

    const quiz = await saveGeneratedDiagnosticQuiz({
      userId: user.id,
      profile,
      model: generated.model,
      coverageSummary: buildDiagnosticCoverageSummary(profile),
      questions,
    });
    return Response.json({ quiz }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AIProviderError) return providerErrorResponse(error);
    console.error("Failed to generate diagnostic quiz", error);
    return Response.json({ error: "Quiz 暂时没有生成成功，请重试。" }, { status: 500 });
  }
}
