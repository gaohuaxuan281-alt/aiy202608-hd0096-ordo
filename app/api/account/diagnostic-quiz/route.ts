import { findUserByCookieHeader } from "../../../../lib/auth";
import { getLatestCompletedDiagnosticQuiz } from "../../../../lib/diagnostic-quiz";

export async function GET(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  try {
    const result = await getLatestCompletedDiagnosticQuiz(user.id);
    const diagnostic = result
      ? {
          attemptId: result.attemptId,
          score: result.score,
          total: result.total,
          percentage: result.percentage,
          coverageSummary: result.coverageSummary,
          subjectScores: result.subjectScores,
          weakTopics: result.weakTopics,
          completedAt: result.completedAt,
        }
      : null;
    return Response.json(
      { diagnostic },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to read diagnostic quiz summary", error);
    return Response.json({ error: "暂时无法读取诊断结果。" }, { status: 500 });
  }
}
