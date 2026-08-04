import {
  createUser,
  isUniquePhoneError,
  isValidPassword,
  isValidPhone,
  normalizePhone,
} from "../../../../lib/auth";
import { appendJournalEntryBestEffort } from "../../../../lib/journal-store";

type RegisterPayload = {
  phone?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
};

export async function POST(request: Request) {
  let payload: RegisterPayload;
  try {
    payload = (await request.json()) as RegisterPayload;
  } catch {
    return Response.json({ error: "请求格式不正确，请重试。" }, { status: 400 });
  }

  const phone = normalizePhone(typeof payload.phone === "string" ? payload.phone : "");
  const password = typeof payload.password === "string" ? payload.password : "";
  const confirmPassword =
    typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";

  if (!isValidPhone(phone)) {
    return Response.json({ error: "请输入正确的 11 位中国大陆手机号。" }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return Response.json({ error: "密码长度需要在 6 到 18 个字符之间。" }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return Response.json({ error: "两次输入的密码不一致。" }, { status: 400 });
  }

  try {
    const user = await createUser(phone, password);
    await appendJournalEntryBestEffort(user.id, {
      eventName: "AccountRegistered",
      actorType: "user",
      actorLabel: "你",
      module: "auth",
      moduleLabel: "账号安全",
      action: "account_registered",
      actionLabel: "注册账号",
      title: "知序账号已创建",
      summary: "手机号账号注册成功，密码内容不会写入日志。",
      reason: "用户完成手机号与密码验证。",
      relatedObject: { type: "account", id: "current-account", label: "账号基本资料", href: "/profile" },
      changes: [{ field: "账号状态", before: "未注册", after: "已注册" }],
      undoable: false,
    });
    return Response.json(
      { ok: true, phone: user.phone },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isUniquePhoneError(error)) {
      return Response.json({ error: "该手机号已注册，请直接登录。" }, { status: 409 });
    }
    console.error("Failed to register user", error);
    return Response.json({ error: "注册暂时没有完成，请稍后重试。" }, { status: 500 });
  }
}
