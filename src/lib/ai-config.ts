import OpenAI from "openai";
import { getSetting, setSetting } from "@/lib/settings-store";

export type AiProvider = "openai";

export type AiConfig = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  timeoutMs: number;
  retryCount: number;
  tokenBudget: number;
};

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_TOKEN_BUDGET = 2000;

function parseIntSetting(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function getAiConfig(): AiConfig | null {
  const provider = (getSetting("ai.provider") ?? "openai").trim() as AiProvider;
  const model = (getSetting("ai.model") ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL).trim();
  const apiKey = (getSetting("ai.api_key") ?? process.env.OPENAI_API_KEY ?? "").trim();
  const baseUrl = (getSetting("ai.base_url") ?? process.env.OPENAI_BASE_URL ?? "").trim() || null;
  const rawTimeoutMs = parseIntSetting(getSetting("ai.timeout_ms"), DEFAULT_TIMEOUT_MS);
  const timeoutMs = rawTimeoutMs < 5000 ? DEFAULT_TIMEOUT_MS : rawTimeoutMs;
  const rawRetryCount = parseIntSetting(getSetting("ai.retry_count"), DEFAULT_RETRY_COUNT);
  const retryCount = Math.max(1, rawRetryCount);
  const rawTokenBudget = parseIntSetting(getSetting("ai.token_budget"), DEFAULT_TOKEN_BUDGET);
  const tokenBudget = rawTokenBudget < 100 ? DEFAULT_TOKEN_BUDGET : rawTokenBudget;

  if (!apiKey) {
    return null;
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl,
    timeoutMs,
    retryCount,
    tokenBudget,
  };
}

export function getMaskedAiConfig(): Omit<AiConfig, "apiKey"> & { apiKeyConfigured: boolean } {
  const config = getAiConfig();
  if (!config) {
    return {
      provider: "openai",
      model: getSetting("ai.model") ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
      baseUrl: getSetting("ai.base_url") ?? process.env.OPENAI_BASE_URL ?? null,
      timeoutMs: parseIntSetting(getSetting("ai.timeout_ms"), DEFAULT_TIMEOUT_MS),
      retryCount: parseIntSetting(getSetting("ai.retry_count"), DEFAULT_RETRY_COUNT),
      tokenBudget: parseIntSetting(getSetting("ai.token_budget"), DEFAULT_TOKEN_BUDGET),
      apiKeyConfigured: false,
    };
  }
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
    tokenBudget: config.tokenBudget,
    apiKeyConfigured: true,
  };
}

export function saveAiConfig(input: {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string | null;
  timeoutMs?: number;
  retryCount?: number;
  tokenBudget?: number;
}) {
  const provider = (input.provider ?? "openai").trim();
  if (provider !== "openai") {
    throw new Error("Unsupported AI provider. Supported providers: openai");
  }
  if (input.model !== undefined) {
    setSetting("ai.model", input.model.trim() || DEFAULT_MODEL);
  }
  if (input.apiKey !== undefined) {
    setSetting("ai.api_key", input.apiKey.trim());
  }
  if (input.baseUrl !== undefined) {
    setSetting("ai.base_url", (input.baseUrl ?? "").trim());
  }
  if (input.timeoutMs !== undefined) {
    if (!Number.isFinite(input.timeoutMs)) {
      throw new Error("timeoutMs must be a number");
    }
    setSetting("ai.timeout_ms", String(Math.max(5000, Math.floor(input.timeoutMs))));
  }
  if (input.retryCount !== undefined) {
    if (!Number.isFinite(input.retryCount)) {
      throw new Error("retryCount must be a number");
    }
    setSetting("ai.retry_count", String(Math.max(0, Math.floor(input.retryCount))));
  }
  if (input.tokenBudget !== undefined) {
    if (!Number.isFinite(input.tokenBudget)) {
      throw new Error("tokenBudget must be a number");
    }
    const clamped = Math.max(100, Math.floor(input.tokenBudget));
    setSetting("ai.token_budget", String(clamped));
  }
  setSetting("ai.provider", provider);
}

export async function testAiConnection(config: AiConfig): Promise<{ ok: true; model: string }> {
  if (config.provider !== "openai") {
    throw new Error("Unsupported provider for connection test");
  }
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? undefined,
    timeout: config.timeoutMs,
    maxRetries: config.retryCount,
  });
  await client.responses.create({
    model: config.model,
    max_output_tokens: 20,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Reply with the single word: ok" }],
      },
    ],
  });
  return { ok: true, model: config.model };
}
