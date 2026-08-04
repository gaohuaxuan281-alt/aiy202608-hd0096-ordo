import {
  findUserByCookieHeader,
  findUserCredentialById,
  isValidPassword,
  readSessionToken,
  updatePassword,
  verifyPassword,
} from "../../../../lib/auth";
import { appendJournalEntryBestEffort } from "../../../../lib/journal-store";

type PasswordPayload = {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = readSessionToken(cookieHeader);
  const user = await findUserByCookieHeader(cookieHeader);
  if (!user || !sessionToken) {
    return Response.json({ error: "请先登录。" }, { status: 401 });
  }

  let payload: PasswordPayload;
  try {
    payload = (await request.json()) as PasswordPayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const currentPassword =
    typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  const confirmPassword =
    typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";

  if (!isValidPassword(newPassword)) {
    return Response.json({ error: "新密码长度需要在 6 到 18 个字符之间。" }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return Response.json({ error: "两次输入的新密码不一致。" }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return Response.json({ error: "新密码不能与当前密码相同。" }, { status: 400 });
  }

  try {
    const credential = await findUserCredentialById(user.id);
    if (!credential || !(await verifyPassword(currentPassword, credential))) {
      return Response.json({ error: "当前密码不正确。" }, { status: 401 });
    }

    await updatePassword(user.id, newPassword, sessionToken);
    await appendJournalEntryBestEffort(user.id, {
      eventName: "AccountSecurityChanged",
      actorType: "user",
      actorLabel: "你",
      module: "auth",
      moduleLabel: "账号安全",
      action: "account_security_changed",
      actionLabel: "安全设置",
      title: "登录密码已更新",
      summary: "账号登录密码已更换，其他登录会话已失效。密码内容不会写入日志。",
      reason: "用户在用户中心完成密码修改。",
      relatedObject: { type: "account", id: "current-account", label: "账号安全设置", href: "/profile" },
      changes: [
        { field: "登录密码", before: "旧密码（内容不记录）", after: "新密码（内容不记录）" },
        { field: "其他会话", before: "可能有效", after: "已失效" },
      ],
      undoable: false,
    });
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to update password", error);
    return Response.json({ error: "密码暂时没有更新，请稍后重试。" }, { status: 500 });
  }
}
