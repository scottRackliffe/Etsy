export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? navigator.userAgent);
}

export function formatShortcutLabel(keys: string[]): string {
  const mac = isMacPlatform();
  return keys
    .map((k) => {
      if (k === "meta") return mac ? "⌘" : "Ctrl";
      if (k === "ctrl") return "Ctrl";
      if (k === "shift") return mac ? "⇧" : "Shift";
      if (k === "alt") return mac ? "⌥" : "Alt";
      if (k === "Escape") return "Esc";
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join(mac ? "" : "+");
}

export function matchesShortcut(
  event: KeyboardEvent,
  key: string,
  modifiers: Array<"meta" | "ctrl" | "shift" | "alt"> = []
): boolean {
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (eventKey !== normalizedKey) return false;

  const wantsMeta = modifiers.includes("meta");
  const wantsCtrl = modifiers.includes("ctrl");
  const wantsShift = modifiers.includes("shift");
  const wantsAlt = modifiers.includes("alt");

  const mac = isMacPlatform();
  const metaOrCtrl = mac ? event.metaKey : event.ctrlKey;
  if (wantsMeta || wantsCtrl) {
    if (!metaOrCtrl) return false;
  } else if (metaOrCtrl && normalizedKey !== "s") {
    return false;
  }

  if (wantsShift !== event.shiftKey) return false;
  if (wantsAlt !== event.altKey) return false;
  return true;
}
