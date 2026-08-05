import type { SubjectCode } from "../config/learning-catalog";

export const MAX_EXAM_UNIT = 20;

function chinaDayNumber(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Math.floor(Date.UTC(read("year"), read("month") - 1, read("day")) / 86_400_000);
}

function examDayNumber(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return Number.NaN;
  return Math.floor(timestamp / 86_400_000);
}

export function getDateAfterDays(days: number) {
  return new Date((chinaDayNumber() + days) * 86_400_000).toISOString().slice(0, 10);
}

export function getDaysUntilExam(examDate: string) {
  return examDayNumber(examDate) - chinaDayNumber();
}

export function isValidExamDate(examDate: string) {
  const days = getDaysUntilExam(examDate);
  return Number.isFinite(days) && days >= 1 && days <= 366;
}

export function formatExamDate(examDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return "尚未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${examDate}T12:00:00+08:00`));
}

export function isValidUnitRange(start: number | null, end: number | null) {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    (start ?? 0) >= 1 &&
    (end ?? 0) <= MAX_EXAM_UNIT &&
    (start ?? 0) <= (end ?? 0)
  );
}

export function formatExamUnitRange(
  subject: SubjectCode,
  start: number | null,
  end: number | null,
) {
  if (!isValidUnitRange(start, end)) return "考试范围尚未设置";
  if (subject === "english") {
    return start === end ? `Unit ${start}` : `Unit ${start}–${end}`;
  }
  return start === end ? `第 ${start} 单元` : `第 ${start}–${end} 单元`;
}
