import { findUserByCookieHeader } from "../../../../lib/auth";
import { getInsightsSummary } from "../../../../lib/insights-store";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
} as const;

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET(request: Request) {
  try {
    const user = await findUserByCookieHeader(request.headers.get("cookie"));
    if (!user) return json({ error: "请先登录。" }, 401);
    const summary = await getInsightsSummary(user.id);
    return json({ summary });
  } catch (error) {
    console.error("Failed to build insights summary", error);
    return json({ error: "暂时无法读取进展洞察数据。" }, 500);
  }
}
