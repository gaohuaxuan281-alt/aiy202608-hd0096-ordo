import type { GradeCode, SubjectCode } from "../config/learning-catalog";

export type DiagnosticQuizDifficulty = "基础" | "进阶" | "挑战";

export type DiagnosticQuizQuestion = {
  id: string;
  position: number;
  subject: SubjectCode;
  subjectLabel: string;
  textbook: string;
  textbookLabel: string;
  unitNumber: number;
  unitLabel: string;
  knowledgePoint: string;
  prompt: string;
  options: string[];
  difficulty: DiagnosticQuizDifficulty;
};

export type DiagnosticQuiz = {
  id: string;
  grade: GradeCode;
  questionCount: 10;
  coverageSummary: string;
  questions: DiagnosticQuizQuestion[];
  createdAt: number;
};

export type DiagnosticQuizAnswer = {
  questionId: string;
  selectedOption: number;
};

export type DiagnosticQuizQuestionResult = DiagnosticQuizQuestion & {
  selectedOption: number;
  correctOption: number;
  isCorrect: boolean;
  explanation: string;
};

export type DiagnosticQuizSubjectScore = {
  subject: SubjectCode;
  subjectLabel: string;
  correct: number;
  total: number;
  percentage: number;
};

export type DiagnosticQuizWeakTopic = {
  subject: SubjectCode;
  subjectLabel: string;
  unitNumber: number;
  unitLabel: string;
  knowledgePoint: string;
};

export type DiagnosticQuizResult = {
  attemptId: string;
  profileFingerprint: string;
  score: number;
  total: 10;
  percentage: number;
  model: string;
  coverageSummary: string;
  subjectScores: DiagnosticQuizSubjectScore[];
  weakTopics: DiagnosticQuizWeakTopic[];
  questions: DiagnosticQuizQuestionResult[];
  completedAt: number;
};
