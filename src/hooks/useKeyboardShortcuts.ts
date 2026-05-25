"use client";

import { useEffect } from "react";
import { isEditableTarget, matchesShortcut } from "@/lib/keyboard-utils";

export type ShortcutConfig = {
  key: string;
  modifiers?: Array<"meta" | "ctrl" | "shift" | "alt">;
  action: () => void;
  enabled?: boolean;
  allowInInput?: boolean;
};

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (shortcut.enabled === false) continue;
        if (!shortcut.allowInInput && isEditableTarget(event.target)) {
          if (shortcut.key !== "Escape") continue;
        }
        if (matchesShortcut(event, shortcut.key, shortcut.modifiers ?? [])) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
