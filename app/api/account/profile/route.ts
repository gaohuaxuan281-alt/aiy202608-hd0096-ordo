import { findUserByCookieHeader } from "../../../../lib/auth";
import { getUserProfile, saveUserProfile } from "../../../../lib/profile";
import { STUDY_STAGES, type StudyStage } from "../../../../lib/profile-types";

type ProfilePayload = {
  displayName?: unknown;
  studyStage?: unknown;
  school?: unknown;
};

async function authenticate(request: Request) {
  return findUserByCookieHeader(request.headers.get("cookie"));
}

export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) {
    return Response.json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    const profile = await getUserProfile(user.id);
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read user profile", error);
    return Response.json({ error: "暂时无法读取账号资料。" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await authenticate(request);
  if (!user) {
    return Response.json({ error: "请先登录。" }, { status: 401 });
  }

  let payload: ProfilePayload;
  try {
    payload = (await request.json()) as ProfilePayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
  const school = typeof payload.school === "string" ? payload.school.trim() : "";
  const studyStage = typeof payload.studyStage === "string" ? payload.studyStage : "";

  if (displayName.length < 1 || displayName.length > 16) {
    return Response.json({ error: "昵称需要在 1 到 16 个字符之间。" }, { status: 400 });
  }
  if (school.length > 40) {
    return Response.json({ error: "学校或机构名称不能超过 40 个字符。" }, { status: 400 });
  }
  if (studyStage && !STUDY_STAGES.includes(studyStage as (typeof STUDY_STAGES)[number])) {
    return Response.json({ error: "请选择正确的学习阶段。" }, { status: 400 });
  }

  try {
    const profile = await saveUserProfile(user.id, {
      displayName,
      school,
      studyStage: studyStage as StudyStage,
    });
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to update user profile", error);
    return Response.json({ error: "资料暂时没有保存，请稍后重试。" }, { status: 500 });
  }
}
