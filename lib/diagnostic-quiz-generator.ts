import {
  SUBJECTS,
  getGrade,
  getTextbookLabel,
  type SubjectCode,
} from "../config/learning-catalog";
import type { GeneratedDiagnosticQuizQuestion } from "./diagnostic-quiz";
import type { DiagnosticQuizDifficulty } from "./diagnostic-quiz-types";
import { formatExamUnitRange } from "./exam-plan";
import type { LearningProfileInput } from "./learning-profile-input";

type CoverageTarget = {
  subject: SubjectCode;
  textbook: string;
  unitNumber: number;
};

type ModelQuizQuestion = {
  subject: string;
  unitNumber: number;
  knowledgePoint: string;
  prompt: string;
  options: string[];
  correctOption: number;
  explanation: string;
  difficulty: string;
};

export type ModelQuizPayload = { questions: ModelQuizQuestion[] };

const DIFFICULTIES = new Set<DiagnosticQuizDifficulty>(["基础", "进阶", "挑战"]);

export const DIAGNOSTIC_QUIZ_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            enum: Object.keys(SUBJECTS),
          },
          unitNumber: { type: "integer", minimum: 1, maximum: 20 },
          knowledgePoint: { type: "string" },
          prompt: { type: "string" },
          options: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "string" },
          },
          correctOption: { type: "integer", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
          difficulty: { type: "string", enum: ["基础", "进阶", "挑战"] },
        },
        required: [
          "subject",
          "unitNumber",
          "knowledgePoint",
          "prompt",
          "options",
          "correctOption",
          "explanation",
          "difficulty",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

function subjectUnitTargets(profile: LearningProfileInput) {
  return profile.subjects.map((item) => ({
    subject: item.subject,
    textbook: item.textbook,
    units: Array.from(
      { length: (item.examUnitEnd ?? 0) - (item.examUnitStart ?? 0) + 1 },
      (_, index) => (item.examUnitStart ?? 1) + index,
    ),
  }));
}

export function buildDiagnosticCoverageTargets(profile: LearningProfileInput): CoverageTarget[] {
  const subjects = subjectUnitTargets(profile);
  const allInterleaved: CoverageTarget[] = [];
  const maxUnits = Math.max(...subjects.map((item) => item.units.length));
  for (let offset = 0; offset < maxUnits; offset += 1) {
    for (const item of subjects) {
      const unitNumber = item.units[offset];
      if (unitNumber !== undefined) {
        allInterleaved.push({
          subject: item.subject,
          textbook: item.textbook,
          unitNumber,
        });
      }
    }
  }

  if (allInterleaved.length <= 10) {
    return Array.from({ length: 10 }, (_, index) => allInterleaved[index % allInterleaved.length]);
  }

  const targets: CoverageTarget[] = subjects.map((item) => ({
    subject: item.subject,
    textbook: item.textbook,
    unitNumber: item.units[0],
  }));
  const remaining = allInterleaved.filter(
    (candidate) => !targets.some(
      (target) => target.subject === candidate.subject && target.unitNumber === candidate.unitNumber,
    ),
  );
  const slots = 10 - targets.length;
  for (let index = 0; index < slots; index += 1) {
    const remainingIndex = Math.min(
      remaining.length - 1,
      Math.floor(((index + 0.5) * remaining.length) / slots),
    );
    targets.push(remaining[remainingIndex]);
  }
  return targets;
}

export function buildDiagnosticCoverageSummary(profile: LearningProfileInput) {
  const scope = profile.subjects
    .map((item) => `${SUBJECTS[item.subject].label} ${formatExamUnitRange(item.subject, item.examUnitStart, item.examUnitEnd)}`)
    .join("、");
  const unitCount = profile.subjects.reduce(
    (total, item) => total + (item.examUnitEnd ?? 0) - (item.examUnitStart ?? 0) + 1,
    0,
  );
  return `覆盖 ${scope}，共 ${unitCount} 个单元；10 题按单元与核心知识点均衡抽样。`;
}

export function buildDiagnosticQuizPrompt(
  profile: LearningProfileInput,
  targets: CoverageTarget[],
) {
  const grade = getGrade(profile.grade);
  const subjectLines = profile.subjects.map((item) =>
    `- ${item.subject} = ${SUBJECTS[item.subject].label}；教材：${getTextbookLabel(profile.grade, item.subject, item.textbook)}；范围：${formatExamUnitRange(item.subject, item.examUnitStart, item.examUnitEnd)}`,
  );
  const targetLines = targets.map((target, index) =>
    `${index + 1}. subject 必须为 ${target.subject}，unitNumber 必须为 ${target.unitNumber}`,
  );

  return `请为中国${grade.stage}${grade.label}学生生成一套 10 题考前诊断选择题。

考试档案：
${subjectLines.join("\n")}

逐题覆盖位置（必须严格按顺序对应）：
${targetLines.join("\n")}

质量要求：
1. 每题恰好 4 个选项且只有 1 个正确答案，correctOption 使用 0–3 下标。
2. 同一单元出现多题时，必须考查不同核心知识点；整套题优先覆盖各单元的概念、方法、常见易错点和基础应用。
3. 题目与解释应符合${grade.label}认知水平，表达清楚，不出偏题、怪题或超纲题。
4. knowledgePoint 写成可用于后续复习排期的短标签；explanation 说明正确依据，并简短指出常见误区。
5. 不引用或虚构教材原文、页码、版权练习题；请自行原创题干。
6. 教材单元标题如存在地区或册次差异，优先使用该年级该教材版本中普遍教学的核心知识，不要编造精确课文标题。
7. 难度分布以基础为主，包含适量进阶题，最多 2 道挑战题。`;
}

export function validateGeneratedDiagnosticQuiz(
  payload: ModelQuizPayload,
  targets: CoverageTarget[],
): GeneratedDiagnosticQuizQuestion[] | null {
  if (!payload || !Array.isArray(payload.questions) || payload.questions.length !== 10) {
    return null;
  }

  const questions: GeneratedDiagnosticQuizQuestion[] = [];
  for (let index = 0; index < payload.questions.length; index += 1) {
    const item = payload.questions[index];
    const target = targets[index];
    if (
      !item ||
      item.subject !== target.subject ||
      item.unitNumber !== target.unitNumber ||
      typeof item.knowledgePoint !== "string" ||
      item.knowledgePoint.trim().length < 2 ||
      typeof item.prompt !== "string" ||
      item.prompt.trim().length < 4 ||
      !Array.isArray(item.options) ||
      item.options.length !== 4 ||
      item.options.some((option) => typeof option !== "string" || !option.trim()) ||
      new Set(item.options.map((option) => option.trim())).size !== 4 ||
      !Number.isInteger(item.correctOption) ||
      item.correctOption < 0 ||
      item.correctOption > 3 ||
      typeof item.explanation !== "string" ||
      item.explanation.trim().length < 4 ||
      !DIFFICULTIES.has(item.difficulty as DiagnosticQuizDifficulty)
    ) {
      return null;
    }

    questions.push({
      subject: target.subject,
      textbook: target.textbook,
      unitNumber: target.unitNumber,
      knowledgePoint: item.knowledgePoint.trim(),
      prompt: item.prompt.trim(),
      options: item.options.map((option) => option.trim()),
      correctOption: item.correctOption,
      explanation: item.explanation.trim(),
      difficulty: item.difficulty as DiagnosticQuizDifficulty,
    });
  }
  return questions;
}
