import {
  AI_MODULES,
  isAIModule,
  type AIModule,
} from "../../../../config/ai";
import {
  SUBJECTS,
  getGrade,
  getTextbookLabel,
} from "../../../../config/learning-catalog";
import {
  countRecentAIRequests,
  getAIConversation,
  getLatestAIConversation,
  saveAIExchange,
} from "../../../../lib/ai-store";
import { AI_MODULE_INSTRUCTIONS } from "../../../../lib/ai-prompts";
import { findUserByCookieHeader } from "../../../../lib/auth";
import {
  formatExamDate,
  formatExamUnitRange,
  getDaysUntilExam,
} from "../../../../lib/exam-plan";
import { getLearningProfile } from "../../../../lib/learning-profile";
import { getLatestCompletedDiagnosticQuiz } from "../../../../lib/diagnostic-quiz";
import { AIProviderError, requestOpenAIResponse } from "../../../../lib/openai";
import { getUserProfile } from "../../../../lib/profile";
import { buildFeedbackSystemContext } from "../../../../lib/daily-feedback";

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_CONTEXT_LENGTH = 3_000;
const REQUESTS_PER_HOUR = 30;

type AIRequestPayload = {
  module?: unknown;
  message?: unknown;
  context?: unknown;
  conversationId?: unknown;
};

async function authenticate(request: Request) {
  return findUserByCookieHeader(request.headers.get("cookie"));
}

function buildInstructions({
  aiModule,
  displayName,
  learningContext,
  pageContext,
}: {
  aiModule: AIModule;
  displayName: string;
  learningContext: string;
  pageContext: string;
}) {
  return `角色：你是“知序”考前学习任务设计器中的 ${AI_MODULES[aiModule].label}，服务中国学生。

目标：${AI_MODULE_INSTRUCTIONS[aiModule]}

学生档案：
- 称呼：${displayName}
- ${learningContext}
${pageContext ? `\n当前页面提供的上下文：\n${pageContext}\n` : ""}
成功标准：
- 使用简体中文，直接回应学生当前问题。
- 内容符合学生年级、科目和教材；不确定时明确说明。
- 建议具体、可执行，必要时给出顺序、时长或完成标准。
- 不虚构分数、任务状态、考试日期或已完成的系统操作。

边界：
- 你只能提供解释、草案和建议，不能声称已经修改 Timeline、Todo、日志、总结、洞察或账号资料。
- 不索要密码、验证码、API Key 或支付信息。
- 如果问题涉及自伤、违法或严重健康风险，停止普通学习建议并建议寻求可信成年人或专业帮助。

输出：优先给结论或下一步，再给必要解释。避免重复和空泛鼓励。`;
}

function providerErrorResponse(error: AIProviderError) {
  if (error.code === "AI_NOT_CONFIGURED") {
    return Response.json(
      { error: "AI 服务尚未完成配置，请联系管理员。", code: error.code },
      { status: 503 },
    );
  }
  if (error.code === "AI_RATE_LIMITED" || error.status === 429) {
    if (error.code === "AI_CREDITS_EXHAUSTED") {
      return Response.json(
        { error: "AI 服务额度不足，请联系管理员补充 OpenAI API 额度。", code: error.code },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "AI 当前请求较多，请稍后再试。", code: "AI_RATE_LIMITED" },
      { status: 429 },
    );
  }
  return Response.json(
    { error: "AI 暂时没有完成回答，请稍后重试。", code: error.code },
    { status: 502 },
  );
}

export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  const aiModule = new URL(request.url).searchParams.get("module") ?? "";
  if (!isAIModule(aiModule)) {
    return Response.json({ error: "AI 模块不正确。" }, { status: 400 });
  }

  try {
    const conversation = await getLatestAIConversation(user.id, aiModule);
    return Response.json({ conversation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read AI conversation", error);
    return Response.json({ error: "暂时无法读取 AI 对话。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  let payload: AIRequestPayload;
  try {
    payload = (await request.json()) as AIRequestPayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const aiModule = typeof payload.module === "string" ? payload.module : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const pageContext = typeof payload.context === "string"
    ? payload.context.trim().slice(0, MAX_CONTEXT_LENGTH)
    : "";
  const conversationId = typeof payload.conversationId === "string"
    ? payload.conversationId.trim()
    : "";

  if (!isAIModule(aiModule)) {
    return Response.json({ error: "AI 模块不正确。" }, { status: 400 });
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { error: `问题需要在 1 到 ${MAX_MESSAGE_LENGTH} 个字符之间。` },
      { status: 400 },
    );
  }

  try {
    const recentRequests = await countRecentAIRequests(user.id, Date.now() - 60 * 60 * 1000);
    if (recentRequests >= REQUESTS_PER_HOUR) {
      return Response.json(
        { error: "本小时的 AI 使用次数已达到上限，请稍后继续。", code: "APP_RATE_LIMITED" },
        { status: 429 },
      );
    }

    const conversation = conversationId
      ? await getAIConversation(user.id, conversationId)
      : null;
    if (conversationId && (!conversation || conversation.module !== aiModule)) {
      return Response.json({ error: "没有找到这段 AI 对话。" }, { status: 404 });
    }

    const [learningProfile, userProfile, diagnosticResult, summaryContext] = await Promise.all([
      getLearningProfile(user.id),
      getUserProfile(user.id),
      getLatestCompletedDiagnosticQuiz(user.id),
      aiModule === "summary"
        ? buildFeedbackSystemContext(user.id)
        : Promise.resolve(null),
    ]);
    const learningContext = learningProfile
      ? [
          `年级：${getGrade(learningProfile.grade).label}`,
          `科目与教材：${learningProfile.subjects
            .map((item) => `${SUBJECTS[item.subject].label}（${getTextbookLabel(learningProfile.grade, item.subject, item.textbook)}）`)
            .join("、")}`,
          `计划考试日期：${learningProfile.examDate ? `${formatExamDate(learningProfile.examDate)}（还有 ${getDaysUntilExam(learningProfile.examDate)} 天）` : "尚未设置"}`,
          `考试范围：${learningProfile.subjects
            .map((item) => `${SUBJECTS[item.subject].label} ${formatExamUnitRange(item.subject, item.examUnitStart, item.examUnitEnd)}`)
            .join("；")}`,
          `最近诊断 Quiz：${diagnosticResult ? `${diagnosticResult.score}/${diagnosticResult.total}（正确率 ${diagnosticResult.percentage}%）` : "尚未完成"}`,
          `诊断薄弱知识点：${diagnosticResult?.weakTopics.length
            ? diagnosticResult.weakTopics.map((item) => `${item.subjectLabel} ${item.unitLabel}·${item.knowledgePoint}`).join("；")
            : "暂未发现明显薄弱点"}`,
        ].join("\n- ")
      : "年级、科目、教材和考试范围尚未设置";

    const aiResponse = await requestOpenAIResponse({
      userId: user.id,
      module: aiModule,
      instructions: buildInstructions({
        aiModule,
        displayName: userProfile.displayName,
        learningContext,
        pageContext: [
          pageContext,
          summaryContext
            ? `反馈总结模块自动读取的今日真实数据：\n${JSON.stringify(summaryContext)}`
            : "",
        ].filter(Boolean).join("\n\n"),
      }),
      history: conversation?.messages ?? [],
      message,
    });

    const saved = await saveAIExchange({
      userId: user.id,
      module: aiModule,
      conversation,
      userMessage: message,
      assistantMessage: aiResponse.text,
      model: aiResponse.model,
      inputTokens: aiResponse.inputTokens,
      outputTokens: aiResponse.outputTokens,
    });

    return Response.json(
      { ...saved, model: aiResponse.model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AIProviderError) return providerErrorResponse(error);
    console.error("AI response failed", error);
    return Response.json({ error: "AI 暂时不可用，请稍后重试。" }, { status: 500 });
  }
}
