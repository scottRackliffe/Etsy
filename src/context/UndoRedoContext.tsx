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
import { usePathname } from "next/navigation";
import { ToastContainer } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api-fetch";
import { isStaleConflictPayload, patchHeaders } from "@/lib/patch-json";
import {
  entityApiPath,
  pickChangedFields,
  UNDO_STACK_MAX,
  type UndoEntity,
  type UndoEntry,
} from "@/lib/undo-types";
import type { Toast } from "@/hooks/useToast";
import type { ApiErrorShape } from "@/types";

export type PatchWithUndoResult<T> =
  | { status: "success"; patch: Partial<T> }
  | { status: "error"; message: string }
  | { status: "stale" };

export type PatchWithUndoOptions<T> = {
  action: string;
  entity: UndoEntity;
  id: number;
  updatedAt: string | null | undefined;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  pickRecord: (payload: Record<string, unknown>) => T | null | undefined;
  onPatched?: (record: T) => void;
};

type UndoRedoContextValue = {
  patchWithUndo: <T extends { updated_at?: string | null }>(
    options: PatchWithUndoOptions<T>
  ) => Promise<PatchWithUndoResult<T>>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
};

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);

function recordPatch<T extends { updated_at?: string | null }>(
  record: T
): Record<string, unknown> {
  return record as Record<string, unknown>;
}

export function UndoRedoProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);
  const undoStackRef = useRef(undoStack);
  const redoStackRef = useRef(redoStack);

  useEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  useEffect(() => {
    redoStackRef.current = redoStack;
  }, [redoStack]);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [pathname]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: Toast["type"], onAction?: () => void) => {
      const id = nextToastId.current++;
      setToasts((current) => [
        ...current,
        {
          id,
          message,
          type,
          onAction,
          actionLabel: onAction ? "Undo" : undefined,
        },
      ]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 5000);
    },
    [dismissToast]
  );

  const pushUndoEntry = useCallback((entry: UndoEntry) => {
    setUndoStack((current) => [...current, entry].slice(-UNDO_STACK_MAX));
    setRedoStack([]);
  }, []);

  const applyEntryState = useCallback(
    async (
      entry: UndoEntry,
      state: Record<string, unknown>,
      mode: "undo" | "redo"
    ): Promise<boolean> => {
      try {
        const response = await apiFetch(entityApiPath(entry.entity, entry.id), {
          method: "PATCH",
          headers: patchHeaders(entry.updatedAt),
          body: JSON.stringify(state),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape &
          Record<string, unknown>;
        if (!response.ok) {
          if (response.status === 409 && isStaleConflictPayload(data)) {
            showToast(
              "Cannot undo — record was modified by another process. Reload to see the current state.",
              "error"
            );
          } else {
            showToast(
              data.error?.user_message ??
                (mode === "undo"
                  ? "We could not undo that change."
                  : "We could not redo that change."),
              "error"
            );
          }
          return false;
        }

        const updatedAt =
          typeof data.updated_at === "string"
            ? data.updated_at
            : typeof (data.item as { updated_at?: string } | undefined)?.updated_at === "string"
              ? (data.item as { updated_at: string }).updated_at
              : typeof (data.order as { updated_at?: string } | undefined)?.updated_at === "string"
                ? (data.order as { updated_at: string }).updated_at
                : typeof (data.customer as { updated_at?: string } | undefined)?.updated_at ===
                    "string"
                  ? (data.customer as { updated_at: string }).updated_at
                  : entry.updatedAt;

        const patchPayload =
          (data.item as Record<string, unknown> | undefined) ??
          (data.order as Record<string, unknown> | undefined) ??
          (data.customer as Record<string, unknown> | undefined) ??
          data;

        entry.onPatched?.(patchPayload);
        entry.updatedAt = updatedAt;

        if (mode === "undo") {
          setUndoStack((current) => current.slice(0, -1));
          setRedoStack((current) => [...current, entry].slice(-UNDO_STACK_MAX));
          showToast(`Undone: ${entry.action}`, "success");
        } else {
          setRedoStack((current) => current.slice(0, -1));
          setUndoStack((current) => [...current, entry].slice(-UNDO_STACK_MAX));
          showToast(`Redone: ${entry.action}`, "success");
        }
        return true;
      } catch {
        showToast(
          mode === "undo" ? "We could not undo that change." : "We could not redo that change.",
          "error"
        );
        return false;
      }
    },
    [showToast]
  );

  const undo = useCallback(async () => {
    const entry = undoStackRef.current[undoStackRef.current.length - 1];
    if (!entry) return;
    await applyEntryState(entry, entry.previousState, "undo");
  }, [applyEntryState]);

  const redo = useCallback(async () => {
    const entry = redoStackRef.current[redoStackRef.current.length - 1];
    if (!entry) return;
    await applyEntryState(entry, entry.newState, "redo");
  }, [applyEntryState]);

  const patchWithUndo = useCallback(
    async <T extends { updated_at?: string | null }>(
      options: PatchWithUndoOptions<T>
    ): Promise<PatchWithUndoResult<T>> => {
      try {
        const response = await apiFetch(entityApiPath(options.entity, options.id), {
          method: "PATCH",
          headers: patchHeaders(options.updatedAt),
          body: JSON.stringify(options.newState),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape &
          Record<string, unknown>;
        if (!response.ok) {
          if (response.status === 409 && isStaleConflictPayload(data)) {
            return { status: "stale" };
          }
          return {
            status: "error",
            message: data.error?.user_message ?? "We could not save that change.",
          };
        }
        const record = options.pickRecord(data);
        if (!record) {
          return { status: "error", message: "We could not save that change." };
        }

        const entry: UndoEntry = {
          action: options.action,
          entity: options.entity,
          id: options.id,
          previousState: options.previousState,
          newState: options.newState,
          timestamp: Date.now(),
          updatedAt: record.updated_at ?? options.updatedAt ?? null,
          onPatched: options.onPatched
            ? (patch) => options.onPatched?.(patch as T)
            : undefined,
        };
        pushUndoEntry(entry);
        options.onPatched?.(record);
        showToast(options.action, "success", () => {
          void undo();
        });
        return { status: "success", patch: record };
      } catch {
        return { status: "error", message: "We could not save that change." };
      }
    },
    [pushUndoEntry, showToast, undo]
  );

  const value = useMemo(
    () => ({
      patchWithUndo,
      undo,
      redo,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    }),
    [patchWithUndo, undo, redo, undoStack.length, redoStack.length]
  );

  return (
    <UndoRedoContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </UndoRedoContext.Provider>
  );
}

export function useUndoRedo(): UndoRedoContextValue {
  const ctx = useContext(UndoRedoContext);
  if (!ctx) {
    throw new Error("useUndoRedo must be used within UndoRedoProvider");
  }
  return ctx;
}

export { pickChangedFields, recordPatch };
