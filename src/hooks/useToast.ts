"use client";

import { useState, useCallback, useRef } from "react";
import { addNotificationEntry } from "@/lib/notifications";

export type ToastType = "success" | "error" | "info" | "warning";

export type Toast = {
  id: number;
  message: string;
  type: ToastType;
  onAction?: () => void;
  actionLabel?: string;
};

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", options?: { persistent?: boolean }) => {
      const id = nextId.current++;
      addNotificationEntry({ type, message });
      setToasts((prev) => [...prev, { id, message, type }]);
      if (!options?.persistent) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
      }
    },
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
