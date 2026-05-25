export type DraftPayload<T> = {
  savedAt: string;
  formState: T;
  entityVersion: string;
};

const MAX_DRAFT_BYTES = 500 * 1024;
const DRAFT_PREFIX = "draft:";

export function draftKey(entityType: string, entityId: number | string): string {
  return `${DRAFT_PREFIX}${entityType}:${entityId}`;
}

export function loadDraft<T>(key: string): DraftPayload<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as DraftPayload<T>;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, payload: DraftPayload<T>): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = JSON.stringify(payload);
    if (raw.length > MAX_DRAFT_BYTES) return false;
    localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function cleanupOldDrafts(maxAgeDays = 7): void {
  if (typeof window === "undefined") return;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const draft = loadDraft<unknown>(key);
      if (!draft?.savedAt) {
        localStorage.removeItem(key);
        continue;
      }
      const saved = new Date(draft.savedAt).getTime();
      if (!Number.isFinite(saved) || saved < cutoff) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

export function formatDraftTime(savedAt: string): string {
  const saved = new Date(savedAt);
  if (Number.isNaN(saved.getTime())) return savedAt;
  const now = new Date();
  const sameDay =
    saved.getDate() === now.getDate() &&
    saved.getMonth() === now.getMonth() &&
    saved.getFullYear() === now.getFullYear();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    saved.getDate() === yesterday.getDate() &&
    saved.getMonth() === yesterday.getMonth() &&
    saved.getFullYear() === yesterday.getFullYear();

  const time = saved.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `${time} today`;
  if (isYesterday) return `yesterday at ${time}`;
  return saved.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isDraftStale(
  draftVersion: string,
  serverUpdatedAt: string | null | undefined
): boolean {
  if (!serverUpdatedAt) return false;
  const draftMs = new Date(draftVersion).getTime();
  const serverMs = new Date(serverUpdatedAt).getTime();
  if (Number.isNaN(draftMs) || Number.isNaN(serverMs)) return false;
  return serverMs > draftMs;
}
