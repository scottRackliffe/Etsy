"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [recovery, setRecovery] = useState<DraftPayload<T> | null>(null);
  const lastSavedRef = useRef<string>("");
  const key = entityId != null && enabled ? draftKey(entityType, entityId) : null;
  const { registerOnDiscard } = useUnsavedChanges();

  useBeforeUnload(enabled && isDirty);

  const markDraftClean = useCallback(() => {
    if (key) clearDraft(key);
    lastSavedRef.current = "";
    setRecovery(null);
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    return registerOnDiscard(markDraftClean);
  }, [enabled, registerOnDiscard, markDraftClean]);

  useEffect(() => {
    if (!key || !enabled) {
      setRecovery(null);
      return;
    }
    const existing = loadDraft<T>(key);
    if (!existing) {
      setRecovery(null);
      return;
    }
    if (isDraftStale(existing.entityVersion, entityVersion)) {
      clearDraft(key);
      setRecovery(null);
      return;
    }
    setRecovery(existing);
  }, [key, entityVersion, enabled]);

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
    setRecovery(null);
  }, [key]);

  const recoveryLabel = recovery ? formatDraftTime(recovery.savedAt) : null;

  return { recovery, recoveryLabel, dismissRecovery, markDraftClean };
}
