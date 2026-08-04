export type JournalActorType = "user" | "ai" | "system";

export type JournalModule =
  | "timeline"
  | "todo"
  | "ai-tutor"
  | "summary"
  | "insights"
  | "profile"
  | "auth";

export type JournalActionType =
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "task_started"
  | "task_paused"
  | "task_completed"
  | "task_delayed"
  | "plan_adjusted"
  | "adjustment_accepted"
  | "adjustment_rejected"
  | "feedback_completed"
  | "tutor_session_completed"
  | "mastery_changed"
  | "membership_changed"
  | "account_registered"
  | "account_signed_in"
  | "account_signed_out"
  | "account_profile_updated"
  | "account_security_changed"
  | "learning_profile_updated"
  | "correction_recorded";

export type JournalChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type JournalRelatedObject = {
  type: "task" | "plan" | "feedback" | "conversation" | "subject" | "account";
  id: string;
  label: string;
  href: string;
};

export type JournalEntry = {
  id: string;
  eventName: string;
  occurredAt: string;
  actorType: JournalActorType;
  actorLabel: string;
  module: JournalModule;
  moduleLabel: string;
  action: JournalActionType;
  actionLabel: string;
  title: string;
  summary: string;
  reason: string;
  relatedObject: JournalRelatedObject;
  changes: JournalChange[];
  undoable: boolean;
  correctionOf?: string;
};

export type JournalSnapshot = {
  generatedAt: string;
  timezone: string;
  entries: JournalEntry[];
};

/**
 * Other modules append immutable domain events through this boundary. The
 * journal owns presentation and querying, never the source module's state.
 */
export type JournalDataAdapter = {
  listEntries: () => Promise<JournalEntry[]>;
};

export type JournalEventInput = Omit<JournalEntry, "id" | "occurredAt"> & {
  id?: string;
  occurredAt?: string;
};
