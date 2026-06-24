import OpenAI from "openai";
import { logApiCall } from "@/lib/api-usage";
import { getSetting, setSetting } from "@/lib/settings-store";
import { encryptValue, decryptValue } from "@/lib/secret-crypto";
import { logger } from "@/lib/logging";

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

/**
 * Task identifiers for model-lane selection (WS-AICOST). Economy-eligible tasks
 * use `ai.economy_model` when set; all others use the primary `ai.model`.
 */
export type AiTask =
  | "generate-listing"
  | "photo-quality"
  | "shot-list"
  | "measure"
  | "receipt-ocr"
  | "expense-scan"
  | "test";

const ECONOMY_TASKS = new Set<AiTask>(["photo-quality", "shot-list", "measure", "receipt-ocr", "expense-scan"]);

/**
 * Resolve the model for a task: the economy model for economy-eligible tasks
 * when one is configured, otherwise the primary model. Never throws; falls back
 * to the primary model on a blank/whitespace economy value.
 */
export function resolveModelForTask(config: AiConfig, task: AiTask): string {
  if (!ECONOMY_TASKS.has(task)) return config.model;
  const economy = (getSetting("ai.economy_model") ?? "").trim();
  return economy || config.model;
}

function parseIntSetting(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function getAiConfig(): AiConfig | null {
  const provider = (getSetting("ai.provider") ?? "openai").trim() as AiProvider;
  const model = (getSetting("ai.model") ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL).trim();
  // Read encrypted key; back-compat: migrate legacy plaintext key on first read.
  let apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    const encryptedKey = getSetting("ai.api_key_encrypted");
    if (encryptedKey) {
      try {
        apiKey = decryptValue(encryptedKey).trim();
      } catch {
        logger.warn("ai-config: failed to decrypt stored API key");
      }
    } else {
      // Legacy plaintext fallback — migrate to encrypted on the spot.
      const legacyKey = (getSetting("ai.api_key") ?? "").trim();
      if (legacyKey) {
        apiKey = legacyKey;
        try {
          setSetting("ai.api_key_encrypted", encryptValue(legacyKey));
          setSetting("ai.api_key", "");
        } catch {
          logger.warn("ai-config: failed to migrate legacy plaintext key to encrypted");
        }
      }
    }
  }
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

export function getMaskedAiConfig(): Omit<AiConfig, "apiKey"> & {
  apiKeyConfigured: boolean;
  economyModel: string;
  premiumModel: string;
  premiumReasoningEffort: string;
} {
  const economyModel = (getSetting("ai.economy_model") ?? "").trim();
  const premiumModel = (getSetting("ai.premium_model") ?? "").trim();
  const premiumReasoningEffort = (getSetting("ai.premium_reasoning_effort") ?? "").trim();
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
      economyModel,
      premiumModel,
      premiumReasoningEffort,
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
    economyModel,
    premiumModel,
    premiumReasoningEffort,
  };
}

export function saveAiConfig(input: {
  provider?: string;
  model?: string;
  economyModel?: string;
  premiumModel?: string;
  premiumReasoningEffort?: string;
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
  if (input.economyModel !== undefined) {
    // Blank = use the primary model for economy-eligible tasks.
    setSetting("ai.economy_model", input.economyModel.trim());
  }
  if (input.premiumModel !== undefined) {
    // Blank = no premium configured; Advance AI falls back to the primary model.
    setSetting("ai.premium_model", input.premiumModel.trim());
  }
  if (input.premiumReasoningEffort !== undefined) {
    // Blank = no reasoning effort override; reasoning models use their default.
    setSetting("ai.premium_reasoning_effort", input.premiumReasoningEffort.trim());
  }
  if (input.apiKey !== undefined) {
    const trimmedKey = input.apiKey.trim();
    setSetting("ai.api_key_encrypted", encryptValue(trimmedKey));
    // Clear legacy plaintext key if present.
    setSetting("ai.api_key", "");
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
  try {
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
    logApiCall("openai", "responses.create/test-connection", 200);
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? (err.status ?? 500) : 500;
    logApiCall("openai", "responses.create/test-connection", status);
    throw err;
  }
  return { ok: true, model: config.model };
}
