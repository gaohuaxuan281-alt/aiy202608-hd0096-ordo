import {
  findUserByCookieHeader,
  findUserCredentialById,
  isValidPassword,
  readSessionToken,
  updatePassword,
  verifyPassword,
} from "../../../../lib/auth";

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
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to update password", error);
    return Response.json({ error: "密码暂时没有更新，请稍后重试。" }, { status: 500 });
  }
}
