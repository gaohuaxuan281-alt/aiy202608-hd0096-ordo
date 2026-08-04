import type {
  JournalActionType,
  JournalActorType,
  JournalChange,
  JournalEntry,
  JournalEventInput,
  JournalModule,
  JournalRelatedObject,
} from "../features/journal/journal-types";
import { getD1 } from "../db";
import { ensureAuthSchema } from "./auth";

type JournalRow = {
  id: string;
  eventName: string;
  occurredAt: number;
  actorType: JournalActorType;
  actorLabel: string;
  module: JournalModule;
  moduleLabel: string;
  action: JournalActionType;
  actionLabel: string;
  title: string;
  summary: string;
  reason: string;
  relatedObjectType: JournalRelatedObject["type"];
  relatedObjectId: string;
  relatedObjectLabel: string;
  relatedObjectHref: string;
  changesJson: string;
  undoable: number;
  correctionOf: string | null;
};

const SENSITIVE_TEXT = /(token|令牌|api[_ -]?key|验证码|cvv|银行卡号)/i;

function assertSafeEntry(input: JournalEventInput) {
  const visibleText = [
    input.title,
    input.summary,
    input.reason,
    input.relatedObject.label,
    ...input.changes.flatMap((change) => [change.field, change.before ?? "", change.after ?? ""]),
  ].join(" ");
  if (SENSITIVE_TEXT.test(visibleText)) {
    throw new Error("Journal entries must not contain credentials or sensitive payment data.");
  }
}

function parseChanges(value: string): JournalChange[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const field = "field" in item && typeof item.field === "string" ? item.field : "";
      const before = "before" in item && (typeof item.before === "string" || item.before === null) ? item.before : null;
      const after = "after" in item && (typeof item.after === "string" || item.after === null) ? item.after : null;
      return field ? [{ field, before, after }] : [];
    });
  } catch {
    return [];
  }
}

function hydrateEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    eventName: row.eventName,
    occurredAt: new Date(row.occurredAt).toISOString(),
    actorType: row.actorType,
    actorLabel: row.actorLabel,
    module: row.module,
    moduleLabel: row.moduleLabel,
    action: row.action,
    actionLabel: row.actionLabel,
    title: row.title,
    summary: row.summary,
    reason: row.reason,
    relatedObject: {
      type: row.relatedObjectType,
      id: row.relatedObjectId,
      label: row.relatedObjectLabel,
      href: row.relatedObjectHref,
    },
    changes: parseChanges(row.changesJson),
    undoable: Boolean(row.undoable),
    correctionOf: row.correctionOf ?? undefined,
  };
}

export async function appendJournalEntry(userId: string, input: JournalEventInput) {
  await ensureAuthSchema();
  assertSafeEntry(input);
  const id = input.id ?? crypto.randomUUID();
  const occurredAt = input.occurredAt ? new Date(input.occurredAt).getTime() : Date.now();
  if (!Number.isFinite(occurredAt)) throw new Error("Journal event time is invalid.");

  await getD1()
    .prepare(`INSERT INTO journal_entries (
      id, user_id, event_name, actor_type, actor_label, module, module_label,
      action, action_label, title, summary, reason, related_object_type,
      related_object_id, related_object_label, related_object_href, changes_json,
      undoable, correction_of, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
    .bind(
      id,
      userId,
      input.eventName,
      input.actorType,
      input.actorLabel,
      input.module,
      input.moduleLabel,
      input.action,
      input.actionLabel,
      input.title,
      input.summary,
      input.reason,
      input.relatedObject.type,
      input.relatedObject.id,
      input.relatedObject.label,
      input.relatedObject.href,
      JSON.stringify(input.changes),
      input.undoable ? 1 : 0,
      input.correctionOf ?? null,
      occurredAt,
    )
    .run();

  return { id, occurredAt };
}

export async function appendJournalEntryBestEffort(userId: string, input: JournalEventInput) {
  try {
    return await appendJournalEntry(userId, input);
  } catch (error) {
    console.error(`Failed to append journal event ${input.eventName}`, error);
    return null;
  }
}

export async function listJournalEntries(userId: string, limit = 250) {
  await ensureAuthSchema();
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const result = await getD1()
    .prepare(`SELECT
      id,
      event_name AS eventName,
      occurred_at AS occurredAt,
      actor_type AS actorType,
      actor_label AS actorLabel,
      module,
      module_label AS moduleLabel,
      action,
      action_label AS actionLabel,
      title,
      summary,
      reason,
      related_object_type AS relatedObjectType,
      related_object_id AS relatedObjectId,
      related_object_label AS relatedObjectLabel,
      related_object_href AS relatedObjectHref,
      changes_json AS changesJson,
      undoable,
      correction_of AS correctionOf
    FROM journal_entries
    WHERE user_id = ?
    ORDER BY occurred_at DESC
    LIMIT ?`)
    .bind(userId, safeLimit)
    .all<JournalRow>();

  return (result.results ?? []).map(hydrateEntry);
}
