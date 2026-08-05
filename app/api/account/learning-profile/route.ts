import {
  SUBJECTS,
  getGrade,
} from "../../../../config/learning-catalog";
import { findUserByCookieHeader } from "../../../../lib/auth";
import {
  formatExamDate,
  formatExamUnitRange,
} from "../../../../lib/exam-plan";
import {
  getLearningProfile,
  saveLearningProfile,
} from "../../../../lib/learning-profile";
import { parseLearningProfileInput } from "../../../../lib/learning-profile-input";
import { appendJournalEntryBestEffort } from "../../../../lib/journal-store";
import { formatStudyWindow } from "../../../../lib/study-time";

type LearningProfilePayload = {
  grade?: unknown;
  examDate?: unknown;
  dailyStudyStart?: unknown;
  dailyStudyEnd?: unknown;
  additionalNotes?: unknown;
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

  const parsed = parseLearningProfileInput(payload);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const input = parsed.value;

  try {
    const previousProfile = await getLearningProfile(user.id);
    const profile = await saveLearningProfile(user.id, input);
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
      !previousProfile ||
      previousProfile.dailyStudyStart !== profile.dailyStudyStart ||
      previousProfile.dailyStudyEnd !== profile.dailyStudyEnd
        ? {
            field: "每日学习时段",
            before: previousProfile
              ? formatStudyWindow(
                  previousProfile.dailyStudyStart,
                  previousProfile.dailyStudyEnd,
                )
              : "未设置",
            after: formatStudyWindow(
              profile.dailyStudyStart,
              profile.dailyStudyEnd,
            ),
          }
        : null,
      previousProfile?.additionalNotes !== profile.additionalNotes
        ? {
            field: "补充说明",
            before: previousProfile?.additionalNotes || "未填写",
            after: profile.additionalNotes || "未填写",
          }
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
