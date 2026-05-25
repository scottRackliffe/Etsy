/** Normalize form values for dirty comparison (trim strings, stable JSON). */
export function normalizeFormValue(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normalizeFormValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeFormValue(v);
    }
    return out;
  }
  return value;
}

export function formStatesEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(normalizeFormValue(a)) === JSON.stringify(normalizeFormValue(b));
}
