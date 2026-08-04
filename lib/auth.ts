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
      ])
      .then(() => undefined)
      .catch((error) => {
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
