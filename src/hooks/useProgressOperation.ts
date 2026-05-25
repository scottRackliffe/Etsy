"use client";

import { useCallback, useRef, useState } from "react";
import type { ProgressModalState } from "@/components/ui/ProgressModal";

type RunOptions = {
  title: string;
  statusText: string;
  mode?: "indeterminate" | "determinate";
  fn: () => Promise<void>;
  onSuccess?: () => void;
  successDelayMs?: number;
};

const initial: ProgressModalState = {
  open: false,
  title: "",
  statusText: "",
  mode: "indeterminate",
};

export function useProgressOperation() {
  const [modal, setModal] = useState<ProgressModalState>(initial);
  const lastRunRef = useRef<RunOptions | null>(null);

  const close = useCallback(() => {
    setModal(initial);
  }, []);

  const run = useCallback(
    async (options: RunOptions) => {
      async function runOperation(opts: RunOptions): Promise<void> {
        lastRunRef.current = opts;
        setModal({
          open: true,
          title: opts.title,
          statusText: opts.statusText,
          mode: opts.mode ?? "indeterminate",
          error: null,
        });
        try {
          await opts.fn();
          setModal((m) => ({ ...m, statusText: "Complete" }));
          await new Promise((r) => window.setTimeout(r, opts.successDelayMs ?? 2000));
          close();
          opts.onSuccess?.();
        } catch (err) {
          const message =
            err &&
            typeof err === "object" &&
            "error" in err &&
            err.error &&
            typeof err.error === "object" &&
            "user_message" in err.error &&
            typeof (err.error as { user_message?: string }).user_message === "string"
              ? (err.error as { user_message: string }).user_message
              : "Something went wrong. Please try again.";
          setModal((m) => ({
            ...m,
            error: message,
            userMessage: message,
            onRetry: () => {
              if (lastRunRef.current) void runOperation(lastRunRef.current);
            },
            onClose: close,
          }));
          throw err;
        }
      }

      await runOperation(options);
    },
    [close]
  );

  const updateProgress = useCallback((current: number, total: number, statusText: string) => {
    setModal((m) => ({
      ...m,
      mode: "determinate",
      current,
      total,
      statusText,
    }));
  }, []);

  return { modal, run, close, updateProgress };
}
