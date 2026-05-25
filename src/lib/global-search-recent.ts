const RECENT_KEY = "global_search_recent";
const LEGACY_KEY = "globalSearch.recent";
const MAX_RECENT = 5;

export function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = localStorage.getItem(RECENT_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        localStorage.setItem(RECENT_KEY, legacy);
        localStorage.removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(term: string): void {
  const trimmed = term.trim();
  if (trimmed.length < 2) return;
  const next = [trimmed, ...loadRecentSearches().filter((t) => t !== trimmed)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function removeRecentSearch(term: string): string[] {
  const next = loadRecentSearches().filter((t) => t !== term);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}
