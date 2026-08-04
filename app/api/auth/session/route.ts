import { findUserByCookieHeader } from "../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const user = await findUserByCookieHeader(request.headers.get("cookie"));
    return Response.json(
      { user },
      {
        status: user ? 200 : 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Failed to read session", error);
    return Response.json(
      { user: null, error: "无法读取登录状态。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
