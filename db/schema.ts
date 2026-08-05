import { sql } from "drizzle-orm";
import {
  check,
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
  dailyStudyStart: text("daily_study_start"),
  dailyStudyEnd: text("daily_study_end"),
  additionalNotes: text("additional_notes"),
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

export const diagnosticQuizAttempts = sqliteTable(
  "diagnostic_quiz_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileFingerprint: text("profile_fingerprint").notNull(),
    grade: text("grade").notNull(),
    examDate: text("exam_date").notNull(),
    status: text("status").notNull(),
    score: integer("score"),
    total: integer("total").notNull(),
    model: text("model").notNull(),
    coverageSummary: text("coverage_summary").notNull(),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("idx_diagnostic_quiz_attempts_user_created").on(table.userId, table.createdAt),
    index("idx_diagnostic_quiz_attempts_user_status_completed").on(
      table.userId,
      table.status,
      table.completedAt,
    ),
  ],
);

export const diagnosticQuizQuestions = sqliteTable(
  "diagnostic_quiz_questions",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => diagnosticQuizAttempts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    subject: text("subject").notNull(),
    textbook: text("textbook").notNull(),
    unitNumber: integer("unit_number").notNull(),
    knowledgePoint: text("knowledge_point").notNull(),
    prompt: text("prompt").notNull(),
    optionsJson: text("options_json").notNull(),
    correctOption: integer("correct_option").notNull(),
    explanation: text("explanation").notNull(),
    difficulty: text("difficulty").notNull(),
  },
  (table) => [
    uniqueIndex("diagnostic_quiz_questions_attempt_position_unique").on(
      table.attemptId,
      table.position,
    ),
    index("idx_diagnostic_quiz_questions_attempt").on(table.attemptId),
  ],
);

export const diagnosticQuizAnswers = sqliteTable(
  "diagnostic_quiz_answers",
  {
    attemptId: text("attempt_id")
      .notNull()
      .references(() => diagnosticQuizAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => diagnosticQuizQuestions.id, { onDelete: "cascade" }),
    selectedOption: integer("selected_option").notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.attemptId, table.questionId] })],
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

export const aiRequestEvents = sqliteTable(
  "ai_request_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_ai_request_events_user_module_created").on(
    table.userId,
    table.module,
    table.createdAt,
  )],
);

export const studyPlans = sqliteTable(
  "study_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    examName: text("exam_name").notNull(),
    examDate: text("exam_date").notNull(),
    targetScore: text("target_score").notNull(),
    inputJson: text("input_json").notNull(),
    planJson: text("plan_json").notNull(),
    model: text("model").notNull(),
    rawResponse: text("raw_response").notNull(),
    parentPlanId: text("parent_plan_id"),
    sourceAdjustmentId: text("source_adjustment_id"),
    generationKey: text("generation_key"),
    generationStatus: text("generation_status").notNull().default("completed"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: integer("lease_expires_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_study_plans_user_updated").on(table.userId, table.updatedAt),
    index("idx_study_plans_user_exam").on(table.userId, table.examDate),
    uniqueIndex("study_plans_user_parent_unique").on(table.userId, table.parentPlanId),
    uniqueIndex("study_plans_source_adjustment_unique").on(table.sourceAdjustmentId),
    uniqueIndex("study_plans_generation_key_unique").on(
      table.userId,
      table.generationKey,
    ),
    check(
      "study_plans_generation_status_check",
      sql`${table.generationStatus} in ('pending', 'completed', 'failed')`,
    ),
  ],
);

export const dailyFeedbacks = sqliteTable(
  "daily_feedbacks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feedbackDate: text("feedback_date").notNull(),
    status: text("status").notNull(),
    basePlanId: text("base_plan_id"),
    basePlanUpdatedAt: integer("base_plan_updated_at"),
    energyLevel: integer("energy_level").notNull(),
    focusLevel: integer("focus_level").notNull(),
    actualStudyMinutes: integer("actual_study_minutes"),
    quickSelectionsJson: text("quick_selections_json").notNull(),
    difficultyNotes: text("difficulty_notes").notNull(),
    incompleteReason: text("incomplete_reason").notNull(),
    unclearKnowledge: text("unclear_knowledge").notNull(),
    tomorrowChanges: text("tomorrow_changes").notNull(),
    tomorrowPriority: text("tomorrow_priority").notNull(),
    additionalNotes: text("additional_notes").notNull(),
    systemContextJson: text("system_context_json").notNull(),
    aiSummaryJson: text("ai_summary_json").notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("daily_feedbacks_user_date_unique").on(table.userId, table.feedbackDate),
    index("idx_daily_feedbacks_user_updated").on(table.userId, table.updatedAt),
  ],
);

export const feedbackAdjustments = sqliteTable(
  "feedback_adjustments",
  {
    id: text("id").primaryKey(),
    feedbackId: text("feedback_id")
      .notNull()
      .references(() => dailyFeedbacks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    basePlanId: text("base_plan_id"),
    basePlanUpdatedAt: integer("base_plan_updated_at"),
    operation: text("operation").notNull(),
    taskId: text("task_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    reason: text("reason").notNull(),
    beforeJson: text("before_json").notNull(),
    afterJson: text("after_json").notNull(),
    decision: text("decision").notNull(),
    decidedAt: integer("decided_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_feedback_adjustments_feedback").on(table.feedbackId, table.createdAt),
    index("idx_feedback_adjustments_user_decision").on(table.userId, table.decision),
  ],
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
