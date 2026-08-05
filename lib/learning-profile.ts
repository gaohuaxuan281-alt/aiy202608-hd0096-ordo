import {
  getGrade,
  getSubjectsForGrade,
  getTextbookLabel,
  isGradeCode,
  isSubjectCode,
  type GradeCode,
  type SubjectCode,
} from "../config/learning-catalog";
import { getD1 } from "../db";
import { ensureAuthSchema } from "./auth";
import { isValidExamDate, isValidUnitRange } from "./exam-plan";

export type SubjectPreference = {
  subject: SubjectCode;
  textbook: string;
  examUnitStart: number | null;
  examUnitEnd: number | null;
};

export type LearningProfile = {
  grade: GradeCode;
  examDate: string | null;
  subjects: SubjectPreference[];
  completedAt: number;
  updatedAt: number;
};

type LearningProfileRow = {
  grade: string;
  examDate: string | null;
  completedAt: number;
  updatedAt: number;
};

type SubjectPreferenceRow = {
  subject: string;
  textbook: string;
  examUnitStart: number | null;
  examUnitEnd: number | null;
};

export function hasCompleteExamPlan(profile: LearningProfile | null): profile is LearningProfile {
  return Boolean(
    profile &&
    profile.examDate &&
    isValidExamDate(profile.examDate) &&
    profile.subjects.every((item) => isValidUnitRange(item.examUnitStart, item.examUnitEnd)),
  );
}

export async function getLearningProfile(userId: string): Promise<LearningProfile | null> {
  await ensureAuthSchema();
  const d1 = getD1();
  const row = await d1
    .prepare(`SELECT
      grade,
      exam_date AS examDate,
      completed_at AS completedAt,
      updated_at AS updatedAt
    FROM user_learning_profiles
    WHERE user_id = ?
    LIMIT 1`)
    .bind(userId)
    .first<LearningProfileRow>();

  if (!row || !isGradeCode(row.grade)) return null;

  const allowedSubjects = getSubjectsForGrade(row.grade);
  const result = await d1
    .prepare(`SELECT
        subject,
        textbook,
        exam_unit_start AS examUnitStart,
        exam_unit_end AS examUnitEnd
      FROM user_subject_preferences
      WHERE user_id = ?
      ORDER BY rowid`)
    .bind(userId)
    .all<SubjectPreferenceRow>();

  const subjects = (result.results ?? []).flatMap((item: SubjectPreferenceRow) => {
    if (!isSubjectCode(item.subject)) return [];
    if (!allowedSubjects.includes(item.subject)) return [];
    if (!getTextbookLabel(row.grade as GradeCode, item.subject, item.textbook)) return [];
    return [{
      subject: item.subject,
      textbook: item.textbook,
      examUnitStart: item.examUnitStart,
      examUnitEnd: item.examUnitEnd,
    }];
  });

  if (subjects.length === 0) return null;

  return {
    grade: row.grade,
    examDate: row.examDate,
    subjects,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  };
}

export async function saveLearningProfile(
  userId: string,
  input: Pick<LearningProfile, "grade" | "examDate" | "subjects">,
): Promise<LearningProfile> {
  await ensureAuthSchema();
  const d1 = getD1();
  const now = Date.now();
  const gradeLabel = getGrade(input.grade).label;

  await d1.batch([
    d1
      .prepare(`INSERT INTO user_learning_profiles (
        user_id, grade, exam_date, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        grade = excluded.grade,
        exam_date = excluded.exam_date,
        updated_at = excluded.updated_at`)
      .bind(userId, input.grade, input.examDate, now, now),
    d1.prepare("DELETE FROM user_subject_preferences WHERE user_id = ?").bind(userId),
    ...input.subjects.map((item) =>
      d1
        .prepare(`INSERT INTO user_subject_preferences (
          user_id, subject, textbook, exam_unit_start, exam_unit_end, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(
          userId,
          item.subject,
          item.textbook,
          item.examUnitStart,
          item.examUnitEnd,
          now,
        ),
    ),
    d1
      .prepare(`INSERT INTO user_profiles (
        user_id, display_name, study_stage, school, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        study_stage = excluded.study_stage,
        updated_at = excluded.updated_at`)
      .bind(userId, "知序同学", gradeLabel, "", now),
  ]);

  const saved = await getLearningProfile(userId);
  if (!saved) throw new Error("Learning profile was not saved");
  return saved;
}
