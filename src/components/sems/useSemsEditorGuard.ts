"use client";

import { useEffect, useRef } from "react";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

/**
 * Wires a SEMS editor instance into the app-wide unsaved-changes guard (ADR-079 §4).
 *
 * - Mirrors the editor's `isDirty` into the global dirty flag so in-app navigation,
 *   tab switches, deep links, and the screen's own list navigation are blocked while
 *   there are unsaved changes.
 * - Registers `onSave` (validate + persist, returns `true` on success) so the
 *   unsaved-changes dialog can offer "Save changes".
 * - Registers `onDiscard` (revert form to its saved baseline) for "Discard changes".
 *
 * Handlers are read through refs so the registration is stable for the editor's
 * lifetime and unregisters cleanly on unmount.
 */
export function useSemsEditorGuard({
  isDirty,
  onSave,
  onDiscard,
}: {
  isDirty: boolean;
  onSave: () => Promise<boolean>;
  onDiscard: () => void;
}) {
  const { setFormDirty, registerOnDiscard, registerSaveHandler } = useUnsavedChanges();

  const saveRef = useRef(onSave);
  const discardRef = useRef(onDiscard);
  saveRef.current = onSave;
  discardRef.current = onDiscard;

  useEffect(() => {
    setFormDirty(isDirty);
  }, [isDirty, setFormDirty]);

  useEffect(() => {
    const unregisterSave = registerSaveHandler(() => saveRef.current());
    const unregisterDiscard = registerOnDiscard(() => discardRef.current());
    return () => {
      unregisterSave();
      unregisterDiscard();
      setFormDirty(false);
    };
  }, [registerSaveHandler, registerOnDiscard, setFormDirty]);
}
