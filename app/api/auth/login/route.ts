import {
  createSession,
  findUserCredentialByPhone,
  isValidPassword,
  isValidPhone,
  normalizePhone,
  serializeSessionCookie,
  verifyPassword,
} from "../../../../lib/auth";

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
