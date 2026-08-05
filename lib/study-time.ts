const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MIN_DAILY_STUDY_WINDOW_MINUTES = 60;
export const MAX_DAILY_STUDY_WINDOW_MINUTES = 12 * 60;

export function parseClockToMinutes(value: string) {
  const match = CLOCK_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function getStudyWindowMinutes(start: string, end: string) {
  const startMinutes = parseClockToMinutes(start);
  const endMinutes = parseClockToMinutes(end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }
  return endMinutes - startMinutes;
}

export function isValidStudyWindow(start: string, end: string) {
  const duration = getStudyWindowMinutes(start, end);
  return Boolean(
    duration !== null &&
    duration >= MIN_DAILY_STUDY_WINDOW_MINUTES &&
    duration <= MAX_DAILY_STUDY_WINDOW_MINUTES,
  );
}

export function formatStudyWindow(start: string | null, end: string | null) {
  return start && end ? `${start}–${end}` : "未设置";
}
