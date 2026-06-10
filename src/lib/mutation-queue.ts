const QUEUE_KEY = "esm_mutation_queue";
const MAX_QUEUE = 50;

export type QueuedMutation = {
  id: string;
  method: string;
  url: string;
  body: string | null;
  headers: Record<string, string>;
  timestamp: string;
  retryCount: number;
};

export const MUTATION_QUEUE_CHANGED_EVENT = "esm-mutation-queue-changed";

function notifyQueueChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MUTATION_QUEUE_CHANGED_EVENT));
  }
}

function readQueue(): QueuedMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedMutation[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notifyQueueChanged();
}

export function mutationQueueLength(): number {
  return readQueue().length;
}

export function enqueueMutation(input: {
  method: string;
  url: string;
  body?: string | null;
  headers?: Record<string, string>;
}): QueuedMutation | "full" {
  const queue = readQueue();
  if (queue.length >= MAX_QUEUE) return "full";

  const entry: QueuedMutation = {
    id: crypto.randomUUID(),
    method: input.method.toUpperCase(),
    url: input.url,
    body: input.body ?? null,
    headers: input.headers ?? {},
    timestamp: new Date().toISOString(),
    retryCount: 0,
  };
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

export function dequeueMutation(id: string): void {
  writeQueue(readQueue().filter((row) => row.id !== id));
}

export function listMutationQueue(): QueuedMutation[] {
  return readQueue();
}

export function clearMutationQueue(): void {
  writeQueue([]);
}
