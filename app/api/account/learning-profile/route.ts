import {
  SUBJECTS,
  getGrade,
  getSubjectsForGrade,
  getTextbookLabel,
  isGradeCode,
  isSubjectCode,
  type SubjectCode,
} from "../../../../config/learning-catalog";
import { findUserByCookieHeader } from "../../../../lib/auth";
import {
  formatExamDate,
  formatExamUnitRange,
  isValidExamDate,
  isValidUnitRange,
} from "../../../../lib/exam-plan";
import {
  getLearningProfile,
  saveLearningProfile,
  type SubjectPreference,
} from "../../../../lib/learning-profile";
import { appendJournalEntryBestEffort } from "../../../../lib/journal-store";

type LearningProfilePayload = {
  grade?: unknown;
  examDate?: unknown;
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
  const examDate = typeof payload.examDate === "string" ? payload.examDate.trim() : "";
  if (!isValidExamDate(examDate)) {
    return Response.json({ error: "考试日期需要在明天到一年以内。" }, { status: 400 });
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
    const examUnitStart = "examUnitStart" in item ? item.examUnitStart : undefined;
    const examUnitEnd = "examUnitEnd" in item ? item.examUnitEnd : undefined;
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
    if (
      typeof examUnitStart !== "number" ||
      typeof examUnitEnd !== "number" ||
      !isValidUnitRange(examUnitStart, examUnitEnd)
    ) {
      return Response.json({ error: `请为${SUBJECTS[subject].label}选择正确的考试 Unit 范围。` }, { status: 400 });
    }
    usedSubjects.add(subject);
    subjects.push({ subject, textbook, examUnitStart, examUnitEnd });
  }

  try {
    const previousProfile = await getLearningProfile(user.id);
    const profile = await saveLearningProfile(user.id, {
      grade: payload.grade,
      examDate,
      subjects,
    });
    const previousSubjects = previousProfile
      ? previousProfile.subjects.map((item) => SUBJECTS[item.subject].label).join("、")
      : "未设置";
    const nextSubjects = profile.subjects.map((item) => SUBJECTS[item.subject].label).join("、");
    const previousScope = previousProfile
      ? previousProfile.subjects
          .map((item) => `${SUBJECTS[item.subject].label} ${formatExamUnitRange(item.subject, item.examUnitStart, item.examUnitEnd)}`)
          .join("；")
      : "未设置";
    const nextScope = profile.subjects
      .map((item) => `${SUBJECTS[item.subject].label} ${formatExamUnitRange(item.subject, item.examUnitStart, item.examUnitEnd)}`)
      .join("；");
    const changes = [
      !previousProfile || previousProfile.grade !== profile.grade
        ? { field: "年级", before: previousProfile ? getGrade(previousProfile.grade).label : "未设置", after: getGrade(profile.grade).label }
        : null,
      previousSubjects !== nextSubjects
        ? { field: "学习科目", before: previousSubjects, after: nextSubjects }
        : null,
      { field: "教材设置", before: previousProfile ? "已配置" : "未设置", after: `${profile.subjects.length} 科已配置` },
      previousProfile?.examDate !== profile.examDate
        ? { field: "计划考试日期", before: previousProfile?.examDate ? formatExamDate(previousProfile.examDate) : "未设置", after: formatExamDate(profile.examDate ?? "") }
        : null,
      previousScope !== nextScope
        ? { field: "考试范围", before: previousScope, after: nextScope }
        : null,
    ].filter((change): change is NonNullable<typeof change> => Boolean(change));
    await appendJournalEntryBestEffort(user.id, {
      eventName: "LearningProfileUpdated",
      actorType: "user",
      actorLabel: "你",
      module: "profile",
      moduleLabel: "用户中心",
      action: "learning_profile_updated",
      actionLabel: "更新学习档案",
      title: previousProfile ? "学习档案已更新" : "学习档案已创建",
      summary: `${getGrade(profile.grade).label} · ${formatExamDate(profile.examDate ?? "")} · ${nextSubjects}`,
      reason: previousProfile ? "用户在用户中心重新设置学习档案。" : "用户完成首次使用问卷。",
      relatedObject: { type: "account", id: "learning-profile", label: "学习档案", href: "/profile" },
      changes,
      undoable: true,
    });
    return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to update learning profile", error);
    return Response.json({ error: "学习档案暂时没有保存，请稍后重试。" }, { status: 500 });
  }
}
