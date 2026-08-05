import { SUBJECTS } from "../config/learning-catalog";
import type { LearningProfile } from "./learning-profile";
import { getStudyWindowMinutes } from "./study-time";
import type { StudyPlanGenerationInput } from "./study-plan/types";

export function buildInitialStudyPlanInput(
  profile: LearningProfile,
): StudyPlanGenerationInput {
  const preferredStartTime = profile.dailyStudyStart ?? "";
  const studyEndTime = profile.dailyStudyEnd ?? "";
  const dailyAvailableMinutes =
    getStudyWindowMinutes(preferredStartTime, studyEndTime) ?? 0;
  const subjectLabels = profile.subjects.map(
    (item) => SUBJECTS[item.subject].label,
  );

  return {
    examName: `${subjectLabels.join("、")}考试`,
    examDate: profile.examDate ?? "",
    targetScore: "",
    dailyAvailableMinutes,
    preferredStartTime,
    unavailableWindows: "",
    fixedCommitments: "",
    mustKeepBoundaries: "",
    focusStrategy:
      "优先修复诊断 Quiz 暴露的薄弱知识点，再覆盖本次考试 Unit 范围。",
    extraContext: [
      preferredStartTime && studyEndTime
        ? `每日允许安排学习任务的时段为 ${preferredStartTime}–${studyEndTime}，任务不得超出这个区间。`
        : "",
      profile.additionalNotes,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
