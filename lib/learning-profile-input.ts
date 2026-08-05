import {
  getSubjectsForGrade,
  getTextbookLabel,
  isGradeCode,
  isSubjectCode,
  SUBJECTS,
  type GradeCode,
} from "../config/learning-catalog";
import { isValidExamDate, isValidUnitRange } from "./exam-plan";
import type { LearningProfile, SubjectPreference } from "./learning-profile";

type LearningProfilePayload = {
  grade?: unknown;
  examDate?: unknown;
  subjects?: unknown;
};

export type LearningProfileInput = Pick<LearningProfile, "grade" | "examDate" | "subjects">;

export type LearningProfileParseResult =
  | { value: LearningProfileInput; error?: never }
  | { value?: never; error: string };

export function parseLearningProfileInput(payload: unknown): LearningProfileParseResult {
  if (!payload || typeof payload !== "object") {
    return { error: "学习档案格式不正确。" };
  }

  const input = payload as LearningProfilePayload;
  if (typeof input.grade !== "string" || !isGradeCode(input.grade)) {
    return { error: "请选择正确的年级。" };
  }

  const examDate = typeof input.examDate === "string" ? input.examDate.trim() : "";
  if (!isValidExamDate(examDate)) {
    return { error: "考试日期需要在明天到一年以内。" };
  }

  if (!Array.isArray(input.subjects) || input.subjects.length === 0) {
    return { error: "请至少选择一个学习科目。" };
  }

  const allowedSubjects = getSubjectsForGrade(input.grade);
  const usedSubjects = new Set<string>();
  const subjects: SubjectPreference[] = [];

  for (const item of input.subjects) {
    if (!item || typeof item !== "object") {
      return { error: "科目设置格式不正确。" };
    }
    const entry = item as Record<string, unknown>;
    const subject = entry.subject;
    const textbook = entry.textbook;
    const examUnitStart = entry.examUnitStart;
    const examUnitEnd = entry.examUnitEnd;

    if (typeof subject !== "string" || !isSubjectCode(subject)) {
      return { error: "请选择正确的学习科目。" };
    }
    if (!allowedSubjects.includes(subject) || usedSubjects.has(subject)) {
      return { error: "科目与所选年级不匹配，或存在重复科目。" };
    }
    if (
      typeof textbook !== "string" ||
      !getTextbookLabel(input.grade as GradeCode, subject, textbook)
    ) {
      return { error: "请为每个科目选择正确的教材版本。" };
    }
    if (
      typeof examUnitStart !== "number" ||
      typeof examUnitEnd !== "number" ||
      !isValidUnitRange(examUnitStart, examUnitEnd)
    ) {
      return { error: `请为${SUBJECTS[subject].label}选择正确的考试 Unit 范围。` };
    }

    usedSubjects.add(subject);
    subjects.push({ subject, textbook, examUnitStart, examUnitEnd });
  }

  return {
    value: {
      grade: input.grade,
      examDate,
      subjects,
    },
  };
}
