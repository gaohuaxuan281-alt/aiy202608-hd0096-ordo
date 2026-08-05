import {
  SUBJECTS,
  getTextbookLabel,
  isGradeCode,
  isSubjectCode,
  type SubjectCode,
} from "../config/learning-catalog";
import { getD1 } from "../db";
import { ensureAuthSchema } from "./auth";
import type {
  DiagnosticQuiz,
  DiagnosticQuizAnswer,
  DiagnosticQuizDifficulty,
  DiagnosticQuizQuestion,
  DiagnosticQuizQuestionResult,
  DiagnosticQuizResult,
  DiagnosticQuizSubjectScore,
  DiagnosticQuizWeakTopic,
} from "./diagnostic-quiz-types";
import { formatExamUnitRange } from "./exam-plan";
import type { LearningProfile } from "./learning-profile";
import type { LearningProfileInput } from "./learning-profile-input";

const QUIZ_TOTAL = 10 as const;
const DIFFICULTIES = new Set<DiagnosticQuizDifficulty>(["基础", "进阶", "挑战"]);

export type GeneratedDiagnosticQuizQuestion = {
  subject: SubjectCode;
  textbook: string;
  unitNumber: number;
  knowledgePoint: string;
  prompt: string;
  options: string[];
  correctOption: number;
  explanation: string;
  difficulty: DiagnosticQuizDifficulty;
};

type QuizAttemptRow = {
  id: string;
  profileFingerprint: string;
  grade: string;
  examDate: string;
  status: string;
  score: number | null;
  total: number;
  model: string;
  coverageSummary: string;
  createdAt: number;
  completedAt: number | null;
};

type QuizQuestionRow = {
  id: string;
  position: number;
  subject: string;
  textbook: string;
  unitNumber: number;
  knowledgePoint: string;
  prompt: string;
  optionsJson: string;
  correctOption: number;
  explanation: string;
  difficulty: string;
  selectedOption: number | null;
  isCorrect: number | null;
};

function createAcademicProfileFingerprintPayload(
  input: LearningProfileInput | LearningProfile,
) {
  return {
    grade: input.grade,
    examDate: input.examDate,
    subjects: [...input.subjects]
      .sort((left, right) => left.subject.localeCompare(right.subject))
      .map((item) => ({
        subject: item.subject,
        textbook: item.textbook,
        examUnitStart: item.examUnitStart,
        examUnitEnd: item.examUnitEnd,
      })),
  };
}

export function createLearningPlanFingerprint(
  input: LearningProfileInput | LearningProfile,
) {
  return JSON.stringify(createAcademicProfileFingerprintPayload(input));
}

export function createStudyPlanProfileFingerprint(
  input: LearningProfileInput | LearningProfile,
) {
  return JSON.stringify({
    ...createAcademicProfileFingerprintPayload(input),
    dailyStudyStart: input.dailyStudyStart,
    dailyStudyEnd: input.dailyStudyEnd,
    additionalNotes: input.additionalNotes.trim(),
  });
}

export function hasCompletedDiagnosticQuizForProfile(
  profile: LearningProfile | null,
  result: DiagnosticQuizResult | null,
) {
  return Boolean(
    profile &&
    result &&
    result.total === QUIZ_TOTAL &&
    result.profileFingerprint === createLearningPlanFingerprint(profile),
  );
}

function parseOptions(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function toPublicQuestion(
  row: QuizQuestionRow,
  grade: LearningProfileInput["grade"],
): DiagnosticQuizQuestion | null {
  if (!isSubjectCode(row.subject)) return null;
  if (!DIFFICULTIES.has(row.difficulty as DiagnosticQuizDifficulty)) return null;
  const options = parseOptions(row.optionsJson);
  const textbookLabel = getTextbookLabel(grade, row.subject, row.textbook);
  if (options.length !== 4 || !textbookLabel) return null;
  return {
    id: row.id,
    position: row.position,
    subject: row.subject,
    subjectLabel: SUBJECTS[row.subject].label,
    textbook: row.textbook,
    textbookLabel,
    unitNumber: row.unitNumber,
    unitLabel: formatExamUnitRange(row.subject, row.unitNumber, row.unitNumber),
    knowledgePoint: row.knowledgePoint,
    prompt: row.prompt,
    options,
    difficulty: row.difficulty as DiagnosticQuizDifficulty,
  };
}

async function getAttempt(userId: string, attemptId: string): Promise<QuizAttemptRow | null> {
  await ensureAuthSchema();
  return getD1()
    .prepare(`SELECT
      id,
      profile_fingerprint AS profileFingerprint,
      grade,
      exam_date AS examDate,
      status,
      score,
      total,
      model,
      coverage_summary AS coverageSummary,
      created_at AS createdAt,
      completed_at AS completedAt
    FROM diagnostic_quiz_attempts
    WHERE id = ? AND user_id = ?
    LIMIT 1`)
    .bind(attemptId, userId)
    .first<QuizAttemptRow>();
}

async function getAttemptQuestions(attemptId: string): Promise<QuizQuestionRow[]> {
  const result = await getD1()
    .prepare(`SELECT
      q.id,
      q.position,
      q.subject,
      q.textbook,
      q.unit_number AS unitNumber,
      q.knowledge_point AS knowledgePoint,
      q.prompt,
      q.options_json AS optionsJson,
      q.correct_option AS correctOption,
      q.explanation,
      q.difficulty,
      a.selected_option AS selectedOption,
      a.is_correct AS isCorrect
    FROM diagnostic_quiz_questions q
    LEFT JOIN diagnostic_quiz_answers a
      ON a.attempt_id = q.attempt_id AND a.question_id = q.id
    WHERE q.attempt_id = ?
    ORDER BY q.position`)
    .bind(attemptId)
    .all<QuizQuestionRow>();
  return (result.results ?? []) as QuizQuestionRow[];
}

export async function countRecentDiagnosticQuizAttempts(userId: string, since: number) {
  await ensureAuthSchema();
  const row = await getD1()
    .prepare(`SELECT COUNT(*) AS count
      FROM diagnostic_quiz_attempts
      WHERE user_id = ? AND created_at >= ?`)
    .bind(userId, since)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function saveGeneratedDiagnosticQuiz({
  userId,
  profile,
  model,
  coverageSummary,
  questions,
}: {
  userId: string;
  profile: LearningProfileInput;
  model: string;
  coverageSummary: string;
  questions: GeneratedDiagnosticQuizQuestion[];
}): Promise<DiagnosticQuiz> {
  if (questions.length !== QUIZ_TOTAL) throw new Error("Diagnostic quiz must contain 10 questions");
  await ensureAuthSchema();
  const d1 = getD1();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const rows = questions.map((question, index) => ({
    ...question,
    id: crypto.randomUUID(),
    position: index + 1,
  }));

  await d1.batch([
    d1
      .prepare(`INSERT INTO diagnostic_quiz_attempts (
        id, user_id, profile_fingerprint, grade, exam_date, status, score, total,
        model, coverage_summary, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        id,
        userId,
        createLearningPlanFingerprint(profile),
        profile.grade,
        profile.examDate,
        "ready",
        null,
        QUIZ_TOTAL,
        model,
        coverageSummary,
        createdAt,
        null,
      ),
    ...rows.map((question) =>
      d1
        .prepare(`INSERT INTO diagnostic_quiz_questions (
          id, attempt_id, position, subject, textbook, unit_number,
          knowledge_point, prompt, options_json, correct_option, explanation, difficulty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          question.id,
          id,
          question.position,
          question.subject,
          question.textbook,
          question.unitNumber,
          question.knowledgePoint,
          question.prompt,
          JSON.stringify(question.options),
          question.correctOption,
          question.explanation,
          question.difficulty,
        ),
    ),
  ]);

  return {
    id,
    grade: profile.grade,
    questionCount: QUIZ_TOTAL,
    coverageSummary,
    questions: rows.map((question) => ({
      id: question.id,
      position: question.position,
      subject: question.subject,
      subjectLabel: SUBJECTS[question.subject].label,
      textbook: question.textbook,
      textbookLabel: getTextbookLabel(profile.grade, question.subject, question.textbook) ?? question.textbook,
      unitNumber: question.unitNumber,
      unitLabel: formatExamUnitRange(question.subject, question.unitNumber, question.unitNumber),
      knowledgePoint: question.knowledgePoint,
      prompt: question.prompt,
      options: question.options,
      difficulty: question.difficulty,
    })),
    createdAt,
  };
}

function buildResult(
  attempt: QuizAttemptRow,
  questionRows: QuizQuestionRow[],
): DiagnosticQuizResult | null {
  const grade = attempt.grade;
  if (!isGradeCode(grade) || attempt.status !== "completed" || !attempt.completedAt) {
    return null;
  }

  const questions = questionRows.flatMap((row): DiagnosticQuizQuestionResult[] => {
    const question = toPublicQuestion(row, grade);
    if (!question || row.selectedOption === null || row.isCorrect === null) return [];
    return [{
      ...question,
      selectedOption: row.selectedOption,
      correctOption: row.correctOption,
      isCorrect: Boolean(row.isCorrect),
      explanation: row.explanation,
    }];
  });
  if (questions.length !== QUIZ_TOTAL) return null;

  const subjectScores = new Map<SubjectCode, { correct: number; total: number }>();
  for (const question of questions) {
    const score = subjectScores.get(question.subject) ?? { correct: 0, total: 0 };
    score.total += 1;
    if (question.isCorrect) score.correct += 1;
    subjectScores.set(question.subject, score);
  }
  const subjectScoreList: DiagnosticQuizSubjectScore[] = Array.from(subjectScores, ([subject, score]) => ({
    subject,
    subjectLabel: SUBJECTS[subject].label,
    correct: score.correct,
    total: score.total,
    percentage: Math.round((score.correct / score.total) * 100),
  }));
  const weakTopics: DiagnosticQuizWeakTopic[] = questions
    .filter((question) => !question.isCorrect)
    .map((question) => ({
      subject: question.subject,
      subjectLabel: question.subjectLabel,
      unitNumber: question.unitNumber,
      unitLabel: question.unitLabel,
      knowledgePoint: question.knowledgePoint,
    }));
  const score = attempt.score ?? questions.filter((question) => question.isCorrect).length;

  return {
    attemptId: attempt.id,
    profileFingerprint: attempt.profileFingerprint,
    score,
    total: QUIZ_TOTAL,
    percentage: Math.round((score / QUIZ_TOTAL) * 100),
    model: attempt.model,
    coverageSummary: attempt.coverageSummary,
    subjectScores: subjectScoreList,
    weakTopics,
    questions,
    completedAt: attempt.completedAt,
  };
}

export async function completeDiagnosticQuiz({
  userId,
  attemptId,
  profile,
  answers,
}: {
  userId: string;
  attemptId: string;
  profile: LearningProfileInput;
  answers: DiagnosticQuizAnswer[];
}): Promise<DiagnosticQuizResult> {
  const attempt = await getAttempt(userId, attemptId);
  if (!attempt) throw new Error("QUIZ_NOT_FOUND");
  if (attempt.profileFingerprint !== createLearningPlanFingerprint(profile)) {
    throw new Error("QUIZ_PROFILE_CHANGED");
  }
  if (attempt.status === "completed") {
    const existing = buildResult(attempt, await getAttemptQuestions(attempt.id));
    if (existing) return existing;
  }

  const questions = await getAttemptQuestions(attempt.id);
  if (questions.length !== QUIZ_TOTAL) throw new Error("QUIZ_INVALID");
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.selectedOption]));
  if (answers.length !== QUIZ_TOTAL || answerMap.size !== QUIZ_TOTAL) {
    throw new Error("QUIZ_INCOMPLETE");
  }
  const scored = questions.map((question) => {
    const selectedOption = answerMap.get(question.id);
    if (!Number.isInteger(selectedOption) || (selectedOption ?? -1) < 0 || (selectedOption ?? 4) > 3) {
      throw new Error("QUIZ_INCOMPLETE");
    }
    return {
      question,
      selectedOption: selectedOption as number,
      isCorrect: selectedOption === question.correctOption,
    };
  });
  const score = scored.filter((item) => item.isCorrect).length;
  const completedAt = Date.now();
  const d1 = getD1();

  await d1.batch([
    d1.prepare("DELETE FROM diagnostic_quiz_answers WHERE attempt_id = ?").bind(attempt.id),
    ...scored.map((item) =>
      d1
        .prepare(`INSERT INTO diagnostic_quiz_answers (
          attempt_id, question_id, selected_option, is_correct
        ) VALUES (?, ?, ?, ?)`)
        .bind(attempt.id, item.question.id, item.selectedOption, item.isCorrect ? 1 : 0),
    ),
    d1
      .prepare(`UPDATE diagnostic_quiz_attempts
        SET status = ?, score = ?, completed_at = ?
        WHERE id = ? AND user_id = ?`)
      .bind("completed", score, completedAt, attempt.id, userId),
  ]);

  const completedAttempt = { ...attempt, status: "completed", score, completedAt };
  const completedQuestions = questions.map((question) => {
    const answer = scored.find((item) => item.question.id === question.id)!;
    return {
      ...question,
      selectedOption: answer.selectedOption,
      isCorrect: answer.isCorrect ? 1 : 0,
    };
  });
  const result = buildResult(completedAttempt, completedQuestions);
  if (!result) throw new Error("QUIZ_RESULT_INVALID");
  return result;
}

export async function getLatestCompletedDiagnosticQuiz(
  userId: string,
): Promise<DiagnosticQuizResult | null> {
  await ensureAuthSchema();
  const attempt = await getD1()
    .prepare(`SELECT
      id,
      profile_fingerprint AS profileFingerprint,
      grade,
      exam_date AS examDate,
      status,
      score,
      total,
      model,
      coverage_summary AS coverageSummary,
      created_at AS createdAt,
      completed_at AS completedAt
    FROM diagnostic_quiz_attempts
    WHERE user_id = ? AND status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 1`)
    .bind(userId)
    .first<QuizAttemptRow>();
  if (!attempt) return null;
  return buildResult(attempt, await getAttemptQuestions(attempt.id));
}
