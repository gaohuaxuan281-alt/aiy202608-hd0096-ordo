import {
  createSession,
  findUserCredentialByPhone,
  isValidPassword,
  isValidPhone,
  normalizePhone,
  serializeSessionCookie,
  verifyPassword,
} from "../../../../lib/auth";
import { appendJournalEntryBestEffort } from "../../../../lib/journal-store";

type LoginPayload = {
  phone?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return Response.json({ error: "请求格式不正确，请重试。" }, { status: 400 });
  }

  const phone = normalizePhone(typeof payload.phone === "string" ? payload.phone : "");
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!isValidPhone(phone) || !isValidPassword(password)) {
    return Response.json({ error: "手机号或密码不正确。" }, { status: 401 });
  }

  try {
    const user = await findUserCredentialByPhone(phone);
    if (!user || !(await verifyPassword(password, user))) {
      return Response.json({ error: "手机号或密码不正确。" }, { status: 401 });
    }

    const token = await createSession(user.id);
    await appendJournalEntryBestEffort(user.id, {
      eventName: "AccountSignedIn",
      actorType: "user",
      actorLabel: "你",
      module: "auth",
      moduleLabel: "账号安全",
      action: "account_signed_in",
      actionLabel: "账号登录",
      title: "账号登录成功",
      summary: "新的登录会话已建立，敏感凭证不会写入日志。",
      reason: "手机号和登录凭证验证成功。",
      relatedObject: { type: "account", id: "current-account", label: "登录设备与账号安全", href: "/profile" },
      changes: [{ field: "会话状态", before: "未登录", after: "已登录" }],
      undoable: false,
    });
    return Response.json(
      { user: { id: user.id, phone: user.phone, createdAt: user.createdAt } },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": serializeSessionCookie(token, request.url),
        },
      },
    );
  } catch (error) {
    console.error("Failed to sign in user", error);
    return Response.json({ error: "登录暂时不可用，请稍后重试。" }, { status: 500 });
  }
}
