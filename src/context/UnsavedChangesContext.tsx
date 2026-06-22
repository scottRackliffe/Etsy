"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { ToastContainer } from "@/components/ui/Toast";
import { cleanupOldDrafts } from "@/lib/form-draft";
import type { Toast } from "@/hooks/useToast";

type UnsavedChangesContextValue = {
  isDirty: boolean;
  setFormDirty: (dirty: boolean) => void;
  confirmLeave: () => Promise<boolean>;
  registerOnDiscard: (handler: () => void) => () => void;
  /**
   * Register the active editor's validate-and-save routine so the unsaved-changes
   * dialog can offer "Save changes". The handler must return `true` on a successful
   * save and `false` on validation failure. Returns an unregister function.
   * When no handler is registered the dialog falls back to its 2-button form.
   */
  registerSaveHandler: (handler: () => Promise<boolean>) => () => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [formDirty, setFormDirty] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);
  const discardHandlersRef = useRef(new Set<() => void>());
  const saveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);

  // Local toast surface (mirrors UndoRedoProvider so the provider does not depend
  // on a parent toast provider).
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);
  const showToast = useCallback(
    (message: string, type: Toast["type"]) => {
      const id = nextToastId.current++;
      setToasts((current) => [...current, { id, message, type }]);
      window.setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast]
  );

  useEffect(() => {
    cleanupOldDrafts();
  }, []);

  const registerOnDiscard = useCallback((handler: () => void) => {
    discardHandlersRef.current.add(handler);
    return () => {
      discardHandlersRef.current.delete(handler);
    };
  }, []);

  const registerSaveHandler = useCallback((handler: () => Promise<boolean>) => {
    saveHandlerRef.current = handler;
    return () => {
      if (saveHandlerRef.current === handler) saveHandlerRef.current = null;
    };
  }, []);

  const confirmLeave = useCallback(() => {
    if (!formDirty) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
      setCanSave(saveHandlerRef.current != null);
      setDialogOpen(true);
    });
  }, [formDirty]);

  const settle = useCallback(
    (allow: boolean) => {
      setDialogOpen(false);
      setSaving(false);
      resolver?.(allow);
      setResolver(null);
    },
    [resolver]
  );

  const handleKeepEditing = useCallback(() => {
    settle(false);
  }, [settle]);

  const handleDiscard = useCallback(() => {
    discardHandlersRef.current.forEach((handler) => handler());
    setFormDirty(false);
    showToast("Changes cancelled.", "info");
    settle(true);
  }, [settle, showToast]);

  const handleSave = useCallback(async () => {
    const handler = saveHandlerRef.current;
    if (!handler) {
      // No save handler registered — behave like Discard's fallback.
      handleDiscard();
      return;
    }
    setSaving(true);
    let ok = false;
    try {
      ok = await handler();
    } catch {
      ok = false;
    }
    if (ok) {
      setFormDirty(false);
      showToast("Changes saved.", "success");
      settle(true);
    } else {
      // Validation (or save) failure: cancel the navigation and keep the user on
      // the form so the field-level errors are visible.
      showToast("Fix the highlighted fields to save.", "error");
      settle(false);
    }
  }, [handleDiscard, settle, showToast]);

  const value = useMemo(
    () => ({
      isDirty: formDirty,
      setFormDirty,
      confirmLeave,
      registerOnDiscard,
      registerSaveHandler,
    }),
    [formDirty, confirmLeave, registerOnDiscard, registerSaveHandler]
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <UnsavedChangesDialog
        open={dialogOpen}
        canSave={canSave}
        busy={saving}
        onSave={() => void handleSave()}
        onDiscard={handleDiscard}
        onKeepEditing={handleKeepEditing}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    return {
      isDirty: false,
      setFormDirty: () => {},
      confirmLeave: async () => true,
      registerOnDiscard: () => () => {},
      registerSaveHandler: () => () => {},
    };
  }
  return ctx;
}
