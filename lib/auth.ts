import { getD1 } from "../db";

const encoder = new TextEncoder();
// Cloudflare Workers Web Crypto currently accepts at most 100,000 PBKDF2 rounds.
// The per-user value is stored with the hash so this can be raised safely later.
const PASSWORD_ITERATIONS = 100_000;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const SESSION_COOKIE_NAME = "zhixu_session";

export type AuthUser = {
  id: string;
  phone: string;
  createdAt: number;
};

type UserCredentialRow = AuthUser & {
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

type SessionUserRow = AuthUser & {
  sessionId: string;
  expiresAt: number;
};

let authSchemaPromise: Promise<void> | null = null;

export async function ensureAuthSchema() {
  if (!authSchemaPromise) {
    const d1 = getD1();
    authSchemaPromise = d1
      .batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY NOT NULL,
          phone TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          password_iterations INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users (phone)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions (token_hash)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS user_profiles (
          user_id TEXT PRIMARY KEY NOT NULL,
          display_name TEXT NOT NULL,
          study_stage TEXT NOT NULL,
          school TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS user_learning_profiles (
          user_id TEXT PRIMARY KEY NOT NULL,
          grade TEXT NOT NULL,
          exam_date TEXT,
          completed_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS user_subject_preferences (
          user_id TEXT NOT NULL,
          subject TEXT NOT NULL,
          textbook TEXT NOT NULL,
          exam_unit_start INTEGER,
          exam_unit_end INTEGER,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, subject),
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS diagnostic_quiz_attempts (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          profile_fingerprint TEXT NOT NULL,
          grade TEXT NOT NULL,
          exam_date TEXT NOT NULL,
          status TEXT NOT NULL,
          score INTEGER,
          total INTEGER NOT NULL,
          model TEXT NOT NULL,
          coverage_summary TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          completed_at INTEGER,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_diagnostic_quiz_attempts_user_created ON diagnostic_quiz_attempts (user_id, created_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_diagnostic_quiz_attempts_user_status_completed ON diagnostic_quiz_attempts (user_id, status, completed_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS diagnostic_quiz_questions (
          id TEXT PRIMARY KEY NOT NULL,
          attempt_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          subject TEXT NOT NULL,
          textbook TEXT NOT NULL,
          unit_number INTEGER NOT NULL,
          knowledge_point TEXT NOT NULL,
          prompt TEXT NOT NULL,
          options_json TEXT NOT NULL,
          correct_option INTEGER NOT NULL,
          explanation TEXT NOT NULL,
          difficulty TEXT NOT NULL,
          FOREIGN KEY (attempt_id) REFERENCES diagnostic_quiz_attempts(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_quiz_questions_attempt_position_unique ON diagnostic_quiz_questions (attempt_id, position)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_diagnostic_quiz_questions_attempt ON diagnostic_quiz_questions (attempt_id)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS diagnostic_quiz_answers (
          attempt_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          selected_option INTEGER NOT NULL,
          is_correct INTEGER NOT NULL,
          PRIMARY KEY (attempt_id, question_id),
          FOREIGN KEY (attempt_id) REFERENCES diagnostic_quiz_attempts(id) ON UPDATE no action ON DELETE cascade,
          FOREIGN KEY (question_id) REFERENCES diagnostic_quiz_questions(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS ai_conversations (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          module TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated ON ai_conversations (user_id, updated_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS ai_messages (
          id TEXT PRIMARY KEY NOT NULL,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          model TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created ON ai_messages (conversation_id, created_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS ai_request_events (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          module TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_ai_request_events_user_module_created ON ai_request_events (user_id, module, created_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS study_plans (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          exam_name TEXT NOT NULL,
          exam_date TEXT NOT NULL,
          target_score TEXT NOT NULL,
          input_json TEXT NOT NULL,
          plan_json TEXT NOT NULL,
          model TEXT NOT NULL,
          raw_response TEXT NOT NULL,
          parent_plan_id TEXT,
          source_adjustment_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_study_plans_user_updated ON study_plans (user_id, updated_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_study_plans_user_exam ON study_plans (user_id, exam_date)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS daily_feedbacks (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          feedback_date TEXT NOT NULL,
          status TEXT NOT NULL,
          base_plan_id TEXT,
          base_plan_updated_at INTEGER,
          energy_level INTEGER NOT NULL,
          focus_level INTEGER NOT NULL,
          actual_study_minutes INTEGER,
          quick_selections_json TEXT NOT NULL,
          difficulty_notes TEXT NOT NULL,
          incomplete_reason TEXT NOT NULL,
          unclear_knowledge TEXT NOT NULL,
          tomorrow_changes TEXT NOT NULL,
          tomorrow_priority TEXT NOT NULL,
          additional_notes TEXT NOT NULL,
          system_context_json TEXT NOT NULL,
          ai_summary_json TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS daily_feedbacks_user_date_unique ON daily_feedbacks (user_id, feedback_date)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_daily_feedbacks_user_updated ON daily_feedbacks (user_id, updated_at)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS feedback_adjustments (
          id TEXT PRIMARY KEY NOT NULL,
          feedback_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          base_plan_id TEXT,
          base_plan_updated_at INTEGER,
          operation TEXT NOT NULL,
          task_id TEXT,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          reason TEXT NOT NULL,
          before_json TEXT NOT NULL,
          after_json TEXT NOT NULL,
          decision TEXT NOT NULL,
          decided_at INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (feedback_id) REFERENCES daily_feedbacks(id) ON UPDATE no action ON DELETE cascade,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_feedback_adjustments_feedback ON feedback_adjustments (feedback_id, created_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_feedback_adjustments_user_decision ON feedback_adjustments (user_id, decision)"),
        d1.prepare(`CREATE TABLE IF NOT EXISTS journal_entries (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          event_name TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          actor_label TEXT NOT NULL,
          module TEXT NOT NULL,
          module_label TEXT NOT NULL,
          action TEXT NOT NULL,
          action_label TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          reason TEXT NOT NULL,
          related_object_type TEXT NOT NULL,
          related_object_id TEXT NOT NULL,
          related_object_label TEXT NOT NULL,
          related_object_href TEXT NOT NULL,
          changes_json TEXT NOT NULL,
          undoable INTEGER NOT NULL,
          correction_of TEXT,
          occurred_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )`),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_journal_entries_user_occurred ON journal_entries (user_id, occurred_at)"),
        d1.prepare("CREATE INDEX IF NOT EXISTS idx_journal_entries_user_module ON journal_entries (user_id, module)"),
      ])
      .then(async () => {
        const [learningProfileColumns, subjectPreferenceColumns, studyPlanColumns] = await Promise.all([
          d1.prepare("PRAGMA table_info(user_learning_profiles)").all<{ name: string }>(),
          d1.prepare("PRAGMA table_info(user_subject_preferences)").all<{ name: string }>(),
          d1.prepare("PRAGMA table_info(study_plans)").all<{ name: string }>(),
        ]);
        const learningRows = (learningProfileColumns.results ?? []) as Array<{ name: string }>;
        const subjectRows = (subjectPreferenceColumns.results ?? []) as Array<{ name: string }>;
        const studyPlanRows = (studyPlanColumns.results ?? []) as Array<{ name: string }>;
        const learningNames = new Set(learningRows.map((item) => item.name));
        const subjectNames = new Set(subjectRows.map((item) => item.name));
        const studyPlanNames = new Set(studyPlanRows.map((item) => item.name));
        const migrations = [];
        if (!learningNames.has("exam_date")) {
          migrations.push(d1.prepare("ALTER TABLE user_learning_profiles ADD COLUMN exam_date TEXT"));
        }
        if (!subjectNames.has("exam_unit_start")) {
          migrations.push(d1.prepare("ALTER TABLE user_subject_preferences ADD COLUMN exam_unit_start INTEGER"));
        }
        if (!subjectNames.has("exam_unit_end")) {
          migrations.push(d1.prepare("ALTER TABLE user_subject_preferences ADD COLUMN exam_unit_end INTEGER"));
        }
        if (!studyPlanNames.has("parent_plan_id")) {
          migrations.push(d1.prepare("ALTER TABLE study_plans ADD COLUMN parent_plan_id TEXT"));
        }
        if (!studyPlanNames.has("source_adjustment_id")) {
          migrations.push(d1.prepare("ALTER TABLE study_plans ADD COLUMN source_adjustment_id TEXT"));
        }
        if (migrations.length) await d1.batch(migrations);
        await d1.batch([
          d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS study_plans_user_parent_unique ON study_plans (user_id, parent_plan_id)"),
          d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS study_plans_source_adjustment_unique ON study_plans (source_adjustment_id)"),
        ]);
      })
      .catch((error: unknown) => {
        authSchemaPromise = null;
        throw error;
      });
  }

  return authSchemaPromise;
}

export function normalizePhone(value: string) {
  return value.replace(/[\s-]/g, "");
}

export function isValidPhone(phone: string) {
  return /^1[3-9]\d{9}$/.test(phone);
}

export function isValidPassword(password: string) {
  return password.length >= 6 && password.length <= 18;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function createPasswordCredential(password: string) {
  const salt = randomBytes(16);
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return {
    passwordHash: bytesToBase64(hash),
    passwordSalt: bytesToBase64(salt),
    passwordIterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password: string, user: UserCredentialRow) {
  const actual = await derivePasswordHash(
    password,
    base64ToBytes(user.passwordSalt),
    user.passwordIterations,
  );
  return constantTimeEqual(actual, base64ToBytes(user.passwordHash));
}

export async function createUser(phone: string, password: string): Promise<AuthUser> {
  await ensureAuthSchema();
  const d1 = getD1();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const credential = await createPasswordCredential(password);

  await d1
    .prepare(`INSERT INTO users (
      id, phone, password_hash, password_salt, password_iterations, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      phone,
      credential.passwordHash,
      credential.passwordSalt,
      credential.passwordIterations,
      createdAt,
    )
    .run();

  return { id, phone, createdAt };
}

export async function findUserCredentialByPhone(phone: string) {
  await ensureAuthSchema();
  const row = await getD1()
    .prepare(`SELECT
      id,
      phone,
      password_hash AS passwordHash,
      password_salt AS passwordSalt,
      password_iterations AS passwordIterations,
      created_at AS createdAt
    FROM users
    WHERE phone = ?
    LIMIT 1`)
    .bind(phone)
    .first<UserCredentialRow>();

  return row ?? null;
}

export async function findUserCredentialById(userId: string) {
  await ensureAuthSchema();
  const row = await getD1()
    .prepare(`SELECT
      id,
      phone,
      password_hash AS passwordHash,
      password_salt AS passwordSalt,
      password_iterations AS passwordIterations,
      created_at AS createdAt
    FROM users
    WHERE id = ?
    LIMIT 1`)
    .bind(userId)
    .first<UserCredentialRow>();

  return row ?? null;
}

export async function updatePassword(
  userId: string,
  newPassword: string,
  currentSessionToken: string,
) {
  await ensureAuthSchema();
  const d1 = getD1();
  const credential = await createPasswordCredential(newPassword);
  const currentTokenHash = await sha256(currentSessionToken);

  await d1.batch([
    d1
      .prepare(`UPDATE users
        SET password_hash = ?, password_salt = ?, password_iterations = ?
        WHERE id = ?`)
      .bind(
        credential.passwordHash,
        credential.passwordSalt,
        credential.passwordIterations,
        userId,
      ),
    d1
      .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
      .bind(userId, currentTokenHash),
  ]);
}

export async function createSession(userId: string) {
  await ensureAuthSchema();
  const token = bytesToBase64(randomBytes(32));
  const tokenHash = await sha256(token);
  const now = Date.now();

  await getD1()
    .prepare(`INSERT INTO sessions (
      id, user_id, token_hash, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      userId,
      tokenHash,
      now + SESSION_MAX_AGE_SECONDS * 1000,
      now,
    )
    .run();

  return token;
}

export function readSessionToken(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [name, ...valueParts] = item.trim().split("=");
    if (name === SESSION_COOKIE_NAME) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function findUserBySessionToken(token: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  await ensureAuthSchema();
  const tokenHash = await sha256(token);
  const row = await getD1()
    .prepare(`SELECT
      users.id AS id,
      users.phone AS phone,
      users.created_at AS createdAt,
      sessions.id AS sessionId,
      sessions.expires_at AS expiresAt
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
    LIMIT 1`)
    .bind(tokenHash)
    .first<SessionUserRow>();

  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    await getD1().prepare("DELETE FROM sessions WHERE id = ?").bind(row.sessionId).run();
    return null;
  }

  return { id: row.id, phone: row.phone, createdAt: row.createdAt };
}

export async function findUserByCookieHeader(cookieHeader: string | null) {
  return findUserBySessionToken(readSessionToken(cookieHeader));
}

export async function revokeSession(token: string | null) {
  if (!token) return;
  await ensureAuthSchema();
  const tokenHash = await sha256(token);
  await getD1().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export function serializeSessionCookie(token: string | null, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:";
  const value = token ? encodeURIComponent(token) : "";
  const maxAge = token ? SESSION_MAX_AGE_SECONDS : 0;
  const expires = token ? "" : "; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${expires}${secure ? "; Secure" : ""}`;
}

export function isUniquePhoneError(error: unknown) {
  const message = error instanceof Error
    ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
    : String(error);
  return message.includes("UNIQUE constraint failed") && message.includes("users.phone");
}
