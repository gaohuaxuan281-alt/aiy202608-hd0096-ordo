import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("users_phone_unique").on(table.phone)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("idx_sessions_user_id").on(table.userId),
  ],
);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  studyStage: text("study_stage").notNull(),
  school: text("school").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userLearningProfiles = sqliteTable("user_learning_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(),
  examDate: text("exam_date"),
  completedAt: integer("completed_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userSubjectPreferences = sqliteTable(
  "user_subject_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    textbook: text("textbook").notNull(),
    examUnitStart: integer("exam_unit_start"),
    examUnitEnd: integer("exam_unit_end"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.subject] })],
);

export const aiConversations = sqliteTable(
  "ai_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    title: text("title").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_ai_conversations_user_updated").on(table.userId, table.updatedAt)],
);

export const aiMessages = sqliteTable(
  "ai_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_ai_messages_conversation_created").on(table.conversationId, table.createdAt)],
);

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    actorType: text("actor_type").notNull(),
    actorLabel: text("actor_label").notNull(),
    module: text("module").notNull(),
    moduleLabel: text("module_label").notNull(),
    action: text("action").notNull(),
    actionLabel: text("action_label").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    reason: text("reason").notNull(),
    relatedObjectType: text("related_object_type").notNull(),
    relatedObjectId: text("related_object_id").notNull(),
    relatedObjectLabel: text("related_object_label").notNull(),
    relatedObjectHref: text("related_object_href").notNull(),
    changesJson: text("changes_json").notNull(),
    undoable: integer("undoable", { mode: "boolean" }).notNull(),
    correctionOf: text("correction_of"),
    occurredAt: integer("occurred_at").notNull(),
  },
  (table) => [
    index("idx_journal_entries_user_occurred").on(table.userId, table.occurredAt),
    index("idx_journal_entries_user_module").on(table.userId, table.module),
  ],
);
