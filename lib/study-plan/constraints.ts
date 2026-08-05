import type { StudyPlanGenerationInput, StudyPlanTask } from "./types";

type HardWindow = {
  date: string | null;
  weekday: number | null;
  startMinutes: number;
  endMinutes: number;
  source: string;
};

const EMPTY_CONSTRAINT_VALUES = new Set(["无", "没有", "无特殊安排", "未填写", "暂无"]);
const WEEKDAYS: Array<[RegExp, number]> = [
  [/(?:周|星期)日|(?:周|星期)天/, 0],
  [/(?:周|星期)一/, 1],
  [/(?:周|星期)二/, 2],
  [/(?:周|星期)三/, 3],
  [/(?:周|星期)四/, 4],
  [/(?:周|星期)五/, 5],
  [/(?:周|星期)六/, 6],
];

function clockMinutes(hours: string, minutes: string) {
  const hour = Number(hours);
  const minute = Number(minutes);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function parseLineWindows(line: string): HardWindow[] {
  const date = line.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? null;
  const weekday = WEEKDAYS.find(([pattern]) => pattern.test(line))?.[1] ?? null;
  const windows: HardWindow[] = [];
  const rangePattern = /(\d{1,2}):(\d{2})\s*(?:-|–|—|~|～|至|到)\s*(\d{1,2}):(\d{2})/g;
  for (const match of line.matchAll(rangePattern)) {
    const startMinutes = clockMinutes(match[1], match[2]);
    const endMinutes = clockMinutes(match[3], match[4]);
    if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) continue;
    windows.push({ date, weekday, startMinutes, endMinutes, source: line });
  }
  if (windows.length) return windows;

  const clock = line.match(/(\d{1,2}):(\d{2})/);
  if (!clock) return windows;
  const minutes = clockMinutes(clock[1], clock[2]);
  if (minutes === null) return windows;
  if (/(睡觉|睡眠|入睡|就寝|休息)/.test(line)) {
    windows.push({ date, weekday, startMinutes: minutes, endMinutes: 24 * 60, source: line });
  } else if (/(起床|起身)/.test(line)) {
    windows.push({ date, weekday, startMinutes: 0, endMinutes: minutes, source: line });
  }
  return windows;
}

export function parsePlanHardConstraints(input: StudyPlanGenerationInput) {
  const lines = [input.unavailableWindows, input.fixedCommitments, input.mustKeepBoundaries]
    .flatMap((value) => value.split(/[\n；;]/))
    .map((value) => value.trim())
    .filter((value) => value && !EMPTY_CONSTRAINT_VALUES.has(value));
  const windows: HardWindow[] = [];
  const unparsedLines: string[] = [];
  for (const line of lines) {
    const parsed = parseLineWindows(line);
    if (parsed.length) windows.push(...parsed);
    else unparsedLines.push(line);
  }
  return { windows, unparsedLines };
}

function weekdayForDate(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function overlapsWindow(task: StudyPlanTask, window: HardWindow) {
  if (window.date && window.date !== task.date) return false;
  if (window.weekday !== null && weekdayForDate(task.date) !== window.weekday) return false;
  const startMatch = /^(\d{2}):(\d{2})$/.exec(task.startTime);
  const endMatch = /^(\d{2}):(\d{2})$/.exec(task.endTime);
  if (!startMatch || !endMatch) return true;
  const taskStart = clockMinutes(startMatch[1], startMatch[2]);
  const taskEnd = clockMinutes(endMatch[1], endMatch[2]);
  if (taskStart === null || taskEnd === null) return true;
  if (window.endMinutes > window.startMinutes) {
    return taskStart < window.endMinutes && taskEnd > window.startMinutes;
  }
  return taskEnd > window.startMinutes || taskStart < window.endMinutes;
}

export function validateTasksAgainstPlanConstraints(
  tasks: StudyPlanTask[],
  input: StudyPlanGenerationInput,
  affectedTaskIds: Set<string>,
) {
  const parsed = parsePlanHardConstraints(input);
  if (parsed.unparsedLines.length) throw new Error("STUDY_PLAN_BOUNDARY_REVIEW_REQUIRED");
  for (const task of tasks) {
    if (!affectedTaskIds.has(task.id)) continue;
    if (parsed.windows.some((window) => overlapsWindow(task, window))) {
      throw new Error("STUDY_PLAN_HARD_BOUNDARY_CONFLICT");
    }
  }
}
