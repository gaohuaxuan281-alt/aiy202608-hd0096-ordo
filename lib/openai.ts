import { env } from "cloudflare:workers";
import type { AIModule } from "../config/ai";
import type { AIMessage } from "./ai-types";

const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";

type OpenAIRuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

type OpenAIResponsePayload = {
  id?: string;
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string; code?: string };
};

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function getOpenAIModel() {
  const runtimeEnv = env as unknown as OpenAIRuntimeEnv;
  return runtimeEnv.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

async function createSafetyIdentifier(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractOutputText(payload: OpenAIResponsePayload) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text!.trim())
    .filter(Boolean)
    .join("\n\n");
}

function throwOpenAIResponseError(response: Response, payload: OpenAIResponsePayload): never {
  console.error("OpenAI request failed", {
    status: response.status,
    code: payload.error?.code,
    message: payload.error?.message,
  });
  const code = payload.error?.code === "credit_balance_exhausted"
    ? "AI_CREDITS_EXHAUSTED"
    : response.status === 429
      ? "AI_RATE_LIMITED"
      : "AI_PROVIDER_ERROR";
  throw new AIProviderError(payload.error?.message ?? "OpenAI request failed", response.status, code);
}

export async function requestOpenAIResponse({
  userId,
  module,
  instructions,
  history,
  message,
}: {
  userId: string;
  module: AIModule;
  instructions: string;
  history: AIMessage[];
  message: string;
}) {
  const runtimeEnv = env as unknown as OpenAIRuntimeEnv;
  const apiKey = runtimeEnv.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AIProviderError("OpenAI API key is not configured", 503, "AI_NOT_CONFIGURED");
  }

  const model = getOpenAIModel();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [
        ...history.slice(-18).map((item) => ({ role: item.role, content: item.content })),
        { role: "user", content: message },
      ],
      reasoning: { effort: "none" },
      text: { verbosity: module === "ai-tutor" ? "medium" : "low" },
      max_output_tokens: module === "ai-tutor" ? 1800 : 1400,
      store: false,
      safety_identifier: await createSafetyIdentifier(userId),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  let payload: OpenAIResponsePayload;
  try {
    payload = (await response.json()) as OpenAIResponsePayload;
  } catch {
    throw new AIProviderError("OpenAI returned an unreadable response", 502, "AI_BAD_RESPONSE");
  }

  if (!response.ok) {
    throwOpenAIResponseError(response, payload);
  }

  const text = extractOutputText(payload);
  if (!text) throw new AIProviderError("OpenAI returned no text", 502, "AI_EMPTY_RESPONSE");

  return {
    text,
    model: payload.model ?? model,
    responseId: payload.id ?? null,
    inputTokens: payload.usage?.input_tokens ?? null,
    outputTokens: payload.usage?.output_tokens ?? null,
  };
}

export async function requestOpenAIStructuredResponse<T>({
  userId,
  instructions,
  message,
  schemaName,
  schema,
  maxOutputTokens = 6_000,
}: {
  userId: string;
  instructions: string;
  message: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
}) {
  const runtimeEnv = env as unknown as OpenAIRuntimeEnv;
  const apiKey = runtimeEnv.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AIProviderError("OpenAI API key is not configured", 503, "AI_NOT_CONFIGURED");
  }

  const model = getOpenAIModel();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [{ role: "user", content: message }],
      reasoning: { effort: "none" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: schemaName,
          schema,
          strict: true,
        },
      },
      max_output_tokens: maxOutputTokens,
      store: false,
      safety_identifier: await createSafetyIdentifier(userId),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  let payload: OpenAIResponsePayload;
  try {
    payload = (await response.json()) as OpenAIResponsePayload;
  } catch {
    throw new AIProviderError("OpenAI returned an unreadable response", 502, "AI_BAD_RESPONSE");
  }
  if (!response.ok) throwOpenAIResponseError(response, payload);

  const text = extractOutputText(payload);
  if (!text) throw new AIProviderError("OpenAI returned no structured output", 502, "AI_EMPTY_RESPONSE");

  try {
    return {
      data: JSON.parse(text) as T,
      model: payload.model ?? model,
      responseId: payload.id ?? null,
      inputTokens: payload.usage?.input_tokens ?? null,
      outputTokens: payload.usage?.output_tokens ?? null,
    };
  } catch {
    throw new AIProviderError("OpenAI returned invalid structured output", 502, "AI_BAD_RESPONSE");
  }
}
