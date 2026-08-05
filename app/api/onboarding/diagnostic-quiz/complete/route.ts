import { findUserByCookieHeader } from "../../../../../lib/auth";
import { completeDiagnosticQuiz } from "../../../../../lib/diagnostic-quiz";
import type { DiagnosticQuizAnswer } from "../../../../../lib/diagnostic-quiz-types";
import { appendJournalEntryBestEffort } from "../../../../../lib/journal-store";
import { saveLearningProfile } from "../../../../../lib/learning-profile";
import { parseLearningProfileInput } from "../../../../../lib/learning-profile-input";

type CompleteQuizPayload = {
  attemptId?: unknown;
  answers?: unknown;
  profile?: unknown;
};

function parseAnswers(value: unknown): DiagnosticQuizAnswer[] | null {
  if (!Array.isArray(value) || value.length !== 10) return null;
  const answers = value.flatMap((item): DiagnosticQuizAnswer[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.questionId !== "string" ||
      !Number.isInteger(entry.selectedOption) ||
      (entry.selectedOption as number) < 0 ||
      (entry.selectedOption as number) > 3
    ) return [];
    return [{
      questionId: entry.questionId,
      selectedOption: entry.selectedOption as number,
    }];
  });
  return answers.length === 10 ? answers : null;
}

export async function POST(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  let payload: CompleteQuizPayload;
  try {
    payload = (await request.json()) as CompleteQuizPayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const attemptId = typeof payload.attemptId === "string" ? payload.attemptId.trim() : "";
  const answers = parseAnswers(payload.answers);
  const parsed = parseLearningProfileInput(payload.profile);
  if (!attemptId) return Response.json({ error: "没有找到这套 Quiz。" }, { status: 400 });
  if (!answers) return Response.json({ error: "请完成全部 10 道题。" }, { status: 400 });
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  const profileInput = parsed.value;

  try {
    const result = await completeDiagnosticQuiz({
      userId: user.id,
      attemptId,
      profile: profileInput,
      answers,
    });
    const profile = await saveLearningProfile(user.id, profileInput);
    const weakSummary = result.weakTopics.length
      ? result.weakTopics.slice(0, 4).map((item) => `${item.subjectLabel}${item.unitLabel}·${item.knowledgePoint}`).join("；")
      : "本次未发现明显薄弱点";
    await appendJournalEntryBestEffort(user.id, {
      eventName: "DiagnosticQuizCompleted",
      actorType: "user",
      actorLabel: "用户",
      module: "insights",
      moduleLabel: "进展洞察",
      action: "mastery_changed",
      actionLabel: "完成考前诊断 Quiz",
      title: "10 题考前诊断已完成",
      summary: `得分 ${result.score}/${result.total}；${weakSummary}`,
      reason: "用户完成首次使用前的 Unit 范围诊断，结果将供 Timeline 和 AI 制定复习计划。",
      relatedObject: { type: "account", id: result.attemptId, label: "考前诊断 Quiz", href: "/profile" },
      changes: [
        { field: "诊断正确率", before: "未诊断", after: `${result.percentage}%` },
        { field: "薄弱知识点", before: "未识别", after: weakSummary },
      ],
      undoable: false,
    });
    return Response.json(
      { profile, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "QUIZ_NOT_FOUND") {
      return Response.json({ error: "这套 Quiz 已失效，请重新生成。" }, { status: 404 });
    }
    if (code === "QUIZ_PROFILE_CHANGED") {
      return Response.json({ error: "考试范围已变化，请重新生成 Quiz。" }, { status: 409 });
    }
    if (code === "QUIZ_INCOMPLETE") {
      return Response.json({ error: "请完成全部 10 道题。" }, { status: 400 });
    }
    console.error("Failed to complete diagnostic quiz", error);
    return Response.json({ error: "Quiz 结果暂时没有保存，请重试。" }, { status: 500 });
  }
}
