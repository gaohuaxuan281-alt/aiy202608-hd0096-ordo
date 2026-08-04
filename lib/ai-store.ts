import type { AIModule } from "../config/ai";
import { getD1 } from "../db";
import { ensureAuthSchema } from "./auth";
import type { AIConversationSnapshot, AIMessage, AIMessageRole } from "./ai-types";

type ConversationRow = {
  id: string;
  module: AIModule;
  title: string;
  createdAt: number;
  updatedAt: number;
};

type MessageRow = AIMessage & {
  role: AIMessageRole;
};

async function getConversationMessages(conversationId: string) {
  const result = await getD1()
    .prepare(`SELECT
      id,
      role,
      content,
      created_at AS createdAt
    FROM ai_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
    LIMIT 40`)
    .bind(conversationId)
    .all<MessageRow>();

  return (result.results ?? []).map((message: MessageRow) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

async function hydrateConversation(row: ConversationRow): Promise<AIConversationSnapshot> {
  return { ...row, messages: await getConversationMessages(row.id) };
}

export async function getLatestAIConversation(userId: string, module: AIModule) {
  await ensureAuthSchema();
  const row = await getD1()
    .prepare(`SELECT
      id,
      module,
      title,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM ai_conversations
    WHERE user_id = ? AND module = ?
    ORDER BY updated_at DESC
    LIMIT 1`)
    .bind(userId, module)
    .first<ConversationRow>();

  return row ? hydrateConversation(row) : null;
}

export async function getAIConversation(userId: string, conversationId: string) {
  await ensureAuthSchema();
  const row = await getD1()
    .prepare(`SELECT
      id,
      module,
      title,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM ai_conversations
    WHERE id = ? AND user_id = ?
    LIMIT 1`)
    .bind(conversationId, userId)
    .first<ConversationRow>();

  return row ? hydrateConversation(row) : null;
}

export async function countRecentAIRequests(userId: string, since: number) {
  await ensureAuthSchema();
  const row = await getD1()
    .prepare(`SELECT COUNT(*) AS total
      FROM ai_messages
      INNER JOIN ai_conversations ON ai_conversations.id = ai_messages.conversation_id
      WHERE ai_conversations.user_id = ?
        AND ai_messages.role = 'user'
        AND ai_messages.created_at >= ?`)
    .bind(userId, since)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function saveAIExchange({
  userId,
  module,
  conversation,
  userMessage,
  assistantMessage,
  model,
  inputTokens,
  outputTokens,
}: {
  userId: string;
  module: AIModule;
  conversation: AIConversationSnapshot | null;
  userMessage: string;
  assistantMessage: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}) {
  await ensureAuthSchema();
  const d1 = getD1();
  const now = Date.now();
  const conversationId = conversation?.id ?? crypto.randomUUID();
  const title = conversation?.title ?? userMessage.replace(/\s+/g, " ").slice(0, 36);
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();

  await d1.batch([
    d1
      .prepare(`INSERT INTO ai_conversations (
        id, user_id, module, title, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`)
      .bind(conversationId, userId, module, title, now, now),
    d1
      .prepare(`INSERT INTO ai_messages (
        id, conversation_id, role, content, model, input_tokens, output_tokens, created_at
      ) VALUES (?, ?, 'user', ?, NULL, NULL, NULL, ?)`)
      .bind(userMessageId, conversationId, userMessage, now),
    d1
      .prepare(`INSERT INTO ai_messages (
        id, conversation_id, role, content, model, input_tokens, output_tokens, created_at
      ) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`)
      .bind(
        assistantMessageId,
        conversationId,
        assistantMessage,
        model,
        inputTokens,
        outputTokens,
        now + 1,
      ),
  ]);

  return {
    conversationId,
    message: {
      id: assistantMessageId,
      role: "assistant" as const,
      content: assistantMessage,
      createdAt: now + 1,
    },
  };
}
