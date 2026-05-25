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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cleanupOldDrafts } from "@/lib/form-draft";

type UnsavedChangesContextValue = {
  isDirty: boolean;
  setFormDirty: (dirty: boolean) => void;
  confirmLeave: () => Promise<boolean>;
  registerOnDiscard: (handler: () => void) => () => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [formDirty, setFormDirty] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);
  const discardHandlersRef = useRef(new Set<() => void>());

  useEffect(() => {
    cleanupOldDrafts();
  }, []);

  const registerOnDiscard = useCallback((handler: () => void) => {
    discardHandlersRef.current.add(handler);
    return () => {
      discardHandlersRef.current.delete(handler);
    };
  }, []);

  const confirmLeave = useCallback(() => {
    if (!formDirty) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
      setDialogOpen(true);
    });
  }, [formDirty]);

  const finish = useCallback(
    (allow: boolean) => {
      setDialogOpen(false);
      if (allow) {
        discardHandlersRef.current.forEach((handler) => handler());
        setFormDirty(false);
      }
      resolver?.(allow);
      setResolver(null);
    },
    [resolver]
  );

  const value = useMemo(
    () => ({ isDirty: formDirty, setFormDirty, confirmLeave, registerOnDiscard }),
    [formDirty, confirmLeave, registerOnDiscard]
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={dialogOpen}
        onClose={() => finish(false)}
        onConfirm={() => finish(true)}
        title="Unsaved changes"
        description="You have unsaved changes that will be lost. What would you like to do?"
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        confirmVariant="danger"
      />
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
    };
  }
  return ctx;
}
