import { getConnectionState } from "@/lib/connection-state";
import { enqueueMutation } from "@/lib/mutation-queue";

const DEFAULT_TIMEOUT_MS = 30_000;

export type ApiFetchConfig = {
  timeout?: number;
  /** Default: true for POST/PATCH/PUT/DELETE, false for GET */
  retryOnError?: boolean;
  /** Default: true for mutations, false for GET */
  queueOnOffline?: boolean;
};

export class MutationQueueFullError extends Error {
  readonly code = "MUTATION_QUEUE_FULL";
  constructor() {
    super("Too many pending changes. Please wait for connection to restore.");
  }
}

export class MutationQueuedError extends Error {
  readonly code = "MUTATION_QUEUED";
  readonly queueId: string;
  constructor(queueId: string) {
    super("Change saved locally and will sync when connection returns.");
    this.queueId = queueId;
  }
}

function isMutation(method: string): boolean {
  const m = method.toUpperCase();
  return m === "POST" || m === "PATCH" || m === "PUT" || m === "DELETE";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const h = new Headers(headers);
  h.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function bodyToString(body: BodyInit | null | undefined): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body;
  return null;
}

function retryAfterMs(header: string | null): number {
  if (!header) return 60_000;
  const seconds = Number.parseInt(header, 10);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return 60_000;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function shouldQueueMutation(queueOnOffline: boolean): boolean {
  if (!queueOnOffline) return false;
  const state = getConnectionState();
  return state === "offline" || state === "server-unreachable";
}

function tryEnqueue(
  method: string,
  url: string,
  body: string | null,
  headers: Record<string, string>
): never {
  const result = enqueueMutation({ method, url, body, headers });
  if (result === "full") throw new MutationQueueFullError();
  throw new MutationQueuedError(result.id);
}

async function fetchWithTransientRetry(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  allowRetry: boolean
): Promise<Response> {
  try {
    let response = await fetchWithTimeout(url, init, timeoutMs);

    if (!allowRetry) return response;

    if (response.status === 500 || response.status === 503 || response.status === 408) {
      await sleep(5000);
      response = await fetchWithTimeout(url, init, timeoutMs);
      return response;
    }

    if (response.status === 429) {
      const waitMs = retryAfterMs(response.headers.get("Retry-After"));
      await sleep(waitMs);
      response = await fetchWithTimeout(url, init, timeoutMs);
    }

    return response;
  } catch (firstError) {
    if (!allowRetry) throw firstError;
    await sleep(3000);
    return fetchWithTimeout(url, init, timeoutMs);
  }
}

export async function apiFetch(
  url: string,
  init?: RequestInit,
  config?: ApiFetchConfig
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const mutation = isMutation(method);
  const timeoutMs = config?.timeout ?? DEFAULT_TIMEOUT_MS;
  const retryOnError = config?.retryOnError ?? mutation;
  const queueOnOffline = config?.queueOnOffline ?? mutation;
  const headers = headersToRecord(init?.headers);
  const body = bodyToString(init?.body);

  if (mutation && queueOnOffline && shouldQueueMutation(true)) {
    tryEnqueue(method, url, body, headers);
  }

  try {
    return await fetchWithTransientRetry(url, init, timeoutMs, retryOnError);
  } catch {
    if (mutation && queueOnOffline) {
      tryEnqueue(method, url, body, headers);
    }
    throw new Error("Network request failed");
  }
}
