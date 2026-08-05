import { findUserByCookieHeader } from "../../../../lib/auth";
import { buildTodoSnapshot, getLatestStudyPlan } from "../../../../lib/study-plan/store";

export async function GET(request: Request) {
  const user = await findUserByCookieHeader(request.headers.get("cookie"));
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  try {
    const plan = await getLatestStudyPlan(user.id);
    if (!plan) {
      return Response.json(
        { snapshot: null, error: "请先在 Timeline 中生成计划。" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { snapshot: buildTodoSnapshot(plan) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to build todo snapshot", error);
    return Response.json({ error: "暂时无法读取 Todo 切片。" }, { status: 500 });
  }
}
