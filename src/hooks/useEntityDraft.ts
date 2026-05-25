"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearDraft,
  draftKey,
  formatDraftTime,
  isDraftStale,
  loadDraft,
  saveDraft,
  type DraftPayload,
} from "@/lib/form-draft";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

const AUTOSAVE_MS = 30_000;

export function useEntityDraft<T>({
  entityType,
  entityId,
  current,
  entityVersion,
  isDirty,
  enabled = true,
}: {
  entityType: string;
  entityId: number | string | null;
  current: T | null;
  entityVersion: string | null | undefined;
  isDirty: boolean;
  enabled?: boolean;
}): {
  recovery: DraftPayload<T> | null;
  recoveryLabel: string | null;
  dismissRecovery: () => void;
  markDraftClean: () => void;
} {
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const lastSavedRef = useRef<string>("");
  const key = entityId != null && enabled ? draftKey(entityType, entityId) : null;
  const { registerOnDiscard } = useUnsavedChanges();

  const recoveryScope = key && enabled ? `${key}:${entityVersion ?? ""}` : "";
  const [loadedScope, setLoadedScope] = useState(recoveryScope);
  if (recoveryScope !== loadedScope) {
    setLoadedScope(recoveryScope);
    setRecoveryDismissed(false);
  }

  const storedRecovery = useMemo((): DraftPayload<T> | null => {
    if (!key || !enabled) return null;
    const existing = loadDraft<T>(key);
    if (!existing) return null;
    if (isDraftStale(existing.entityVersion, entityVersion)) {
      clearDraft(key);
      return null;
    }
    return existing;
  }, [key, entityVersion, enabled]);

  const recovery = recoveryDismissed ? null : storedRecovery;

  useBeforeUnload(enabled && isDirty);

  const markDraftClean = useCallback(() => {
    if (key) clearDraft(key);
    lastSavedRef.current = "";
    setRecoveryDismissed(true);
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    return registerOnDiscard(markDraftClean);
  }, [enabled, registerOnDiscard, markDraftClean]);

  useEffect(() => {
    if (!key || !enabled || !isDirty || current == null) return;
    const timer = window.setInterval(() => {
      const serialized = JSON.stringify(current);
      if (serialized === lastSavedRef.current) return;
      const ok = saveDraft(key, {
        savedAt: new Date().toISOString(),
        formState: current,
        entityVersion: entityVersion ?? "",
      });
      if (ok) lastSavedRef.current = serialized;
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [key, enabled, isDirty, current, entityVersion]);

  const dismissRecovery = useCallback(() => {
    if (key) clearDraft(key);
    setRecoveryDismissed(true);
  }, [key]);

  const recoveryLabel = recovery ? formatDraftTime(recovery.savedAt) : null;

  return { recovery, recoveryLabel, dismissRecovery, markDraftClean };
}
