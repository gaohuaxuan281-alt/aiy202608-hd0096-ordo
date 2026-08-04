import {
  findUserByCookieHeader,
  readSessionToken,
  revokeSession,
  serializeSessionCookie,
} from "../../../../lib/auth";
import { appendJournalEntryBestEffort } from "../../../../lib/journal-store";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const token = readSessionToken(cookieHeader);
  try {
    const user = await findUserByCookieHeader(cookieHeader);
    await revokeSession(token);
    if (user) {
      await appendJournalEntryBestEffort(user.id, {
        eventName: "AccountSignedOut",
        actorType: "user",
        actorLabel: "你",
        module: "auth",
        moduleLabel: "账号安全",
        action: "account_signed_out",
        actionLabel: "退出登录",
        title: "当前登录会话已退出",
        summary: "当前设备的登录会话已经结束。",
        reason: "用户主动退出知序。",
        relatedObject: { type: "account", id: "current-account", label: "登录设备与账号安全", href: "/profile" },
        changes: [{ field: "会话状态", before: "已登录", after: "已退出" }],
        undoable: false,
      });
    }
  } catch (error) {
    console.error("Failed to revoke session", error);
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": serializeSessionCookie(null, request.url),
      },
    },
  );
}
