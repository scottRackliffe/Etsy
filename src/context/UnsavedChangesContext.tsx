"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type UnsavedChangesContextValue = {
  isDirty: boolean;
  setFormDirty: (dirty: boolean) => void;
  confirmLeave: () => Promise<boolean>;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [formDirty, setFormDirty] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

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
      if (allow) setFormDirty(false);
      resolver?.(allow);
      setResolver(null);
    },
    [resolver]
  );

  const value = useMemo(
    () => ({ isDirty: formDirty, setFormDirty, confirmLeave }),
    [formDirty, confirmLeave]
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
    };
  }
  return ctx;
}
