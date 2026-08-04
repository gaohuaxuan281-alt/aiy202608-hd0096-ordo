import {
  getSubjectsForGrade,
  getTextbookLabel,
  isGradeCode,
  isSubjectCode,
  type SubjectCode,
} from "../../../../config/learning-catalog";
import { findUserByCookieHeader } from "../../../../lib/auth";
import {
  getLearningProfile,
  saveLearningProfile,
  type SubjectPreference,
} from "../../../../lib/learning-profile";

type LearningProfilePayload = {
  grade?: unknown;
  subjects?: unknown;
};

async function authenticate(request: Request) {
  return findUserByCookieHeader(request.headers.get("cookie"));
}

export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  try {
    const profile = await getLearningProfile(user.id);
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read learning profile", error);
    return Response.json({ error: "暂时无法读取学习档案。" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  let payload: LearningProfilePayload;
  try {
    payload = (await request.json()) as LearningProfilePayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  if (typeof payload.grade !== "string" || !isGradeCode(payload.grade)) {
    return Response.json({ error: "请选择正确的年级。" }, { status: 400 });
  }
  if (!Array.isArray(payload.subjects) || payload.subjects.length === 0) {
    return Response.json({ error: "请至少选择一个学习科目。" }, { status: 400 });
  }

  const allowedSubjects = getSubjectsForGrade(payload.grade);
  const subjects: SubjectPreference[] = [];
  const usedSubjects = new Set<SubjectCode>();

  for (const item of payload.subjects) {
    if (!item || typeof item !== "object") {
      return Response.json({ error: "科目信息格式不正确。" }, { status: 400 });
    }
    const subject = "subject" in item ? item.subject : undefined;
    const textbook = "textbook" in item ? item.textbook : undefined;
    if (typeof subject !== "string" || !isSubjectCode(subject)) {
      return Response.json({ error: "请选择正确的学习科目。" }, { status: 400 });
    }
    if (!allowedSubjects.includes(subject) || usedSubjects.has(subject)) {
      return Response.json({ error: "所选科目与当前年级不匹配。" }, { status: 400 });
    }
    if (
      typeof textbook !== "string" ||
      !getTextbookLabel(payload.grade, subject, textbook)
    ) {
      return Response.json({ error: "请为每个科目选择正确的教材版本。" }, { status: 400 });
    }
    usedSubjects.add(subject);
    subjects.push({ subject, textbook });
  }

  try {
    const profile = await saveLearningProfile(user.id, { grade: payload.grade, subjects });
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to update learning profile", error);
    return Response.json({ error: "学习档案暂时没有保存，请稍后重试。" }, { status: 500 });
  }
}
