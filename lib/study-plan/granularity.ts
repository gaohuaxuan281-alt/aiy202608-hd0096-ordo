export const MIN_TIMELINE_TASK_MINUTES = 10;
export const PREFERRED_TIMELINE_TASK_MINUTES = 15;
export const PREFERRED_MAX_TIMELINE_TASK_MINUTES = 20;
export const MAX_TIMELINE_TASK_MINUTES = 30;

export function clampTimelineTaskDuration(
  value: unknown,
  fallback = PREFERRED_TIMELINE_TASK_MINUTES,
) {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
  return Math.min(
    MAX_TIMELINE_TASK_MINUTES,
    Math.max(MIN_TIMELINE_TASK_MINUTES, normalized),
  );
}

/**
 * Splits a legacy long task into balanced micro-task durations. Chunks stay in
 * the preferred 10–20 minute range whenever the original total allows it.
 */
export function splitTimelineTaskDurations(totalMinutes: number) {
  if (!Number.isInteger(totalMinutes) || totalMinutes < MIN_TIMELINE_TASK_MINUTES) {
    throw new Error("STUDY_PLAN_DURATION_INVALID");
  }
  if (totalMinutes <= MAX_TIMELINE_TASK_MINUTES) return [totalMinutes];

  const partCount = Math.ceil(totalMinutes / PREFERRED_MAX_TIMELINE_TASK_MINUTES);
  const base = Math.floor(totalMinutes / partCount);
  const remainder = totalMinutes % partCount;
  const durations = Array.from(
    { length: partCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );

  if (durations.some(
    (duration) =>
      duration < MIN_TIMELINE_TASK_MINUTES ||
      duration > MAX_TIMELINE_TASK_MINUTES,
  )) {
    throw new Error("STUDY_PLAN_DURATION_INVALID");
  }
  return durations;
}

export function validateTimelineTaskDuration(durationMinutes: number) {
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < MIN_TIMELINE_TASK_MINUTES ||
    durationMinutes > MAX_TIMELINE_TASK_MINUTES
  ) {
    throw new Error("STUDY_PLAN_DURATION_INVALID");
  }
}
