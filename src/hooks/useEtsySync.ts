"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch, MutationQueuedError } from "@/lib/api-fetch";
import { applyJobProgressToModal, useJobPoll, type JobPollResult } from "@/hooks/useJobPoll";
import type { ProgressModalState } from "@/components/ui/ProgressModal";
import type { ApiErrorShape } from "@/types";

const initialModal: ProgressModalState = {
  open: false,
  title: "",
  statusText: "",
  mode: "determinate",
};

export type EtsySyncSummary = {
  synced?: number;
  skipped_already_imported?: number;
  created_orders?: number;
  cancelled?: boolean;
};

export function useEtsySync() {
  const [modal, setModal] = useState<ProgressModalState>(initialModal);
  const [syncing, setSyncing] = useState(false);
  const jobIdRef = useRef<string | null>(null);
  const lastShopRef = useRef<number | null>(null);
  const { pollJob, cancelJob, stopPolling } = useJobPoll();

  const close = useCallback(() => {
    stopPolling();
    jobIdRef.current = null;
    setModal(initialModal);
    setSyncing(false);
  }, [stopPolling]);

  const runSync = useCallback(
    async (
      shopId: number,
      options?: {
        onSuccess?: (summary: EtsySyncSummary) => void;
        onCancelled?: (summary: EtsySyncSummary) => void;
        onError?: (err: unknown) => void;
      }
    ) => {
      if (syncing) return;
      lastShopRef.current = shopId;
      setSyncing(true);
      setModal({
        open: true,
        title: "Syncing Etsy orders",
        statusText: "Starting sync…",
        mode: "determinate",
        current: 0,
        total: 0,
        onCancel: () => {
          if (jobIdRef.current) void cancelJob(jobIdRef.current);
        },
      });

      try {
        const response = await apiFetch("/api/sync/etsy", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ shop_id: shopId }),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & {
          job_id?: string;
        };

        if (response.status === 409) {
          throw data;
        }
        if (!response.ok || !data.job_id) {
          throw data;
        }

        jobIdRef.current = data.job_id;

        await pollJob(data.job_id, {
          onProgress: (progress) => applyJobProgressToModal(setModal, progress),
          onComplete: (job: JobPollResult) => {
            const result = (job.result ?? {}) as EtsySyncSummary;
            const synced = result.synced ?? 0;
            const skipped = result.skipped_already_imported ?? 0;
            const msg = synced > 0
              ? `Synced ${synced} order${synced !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} already imported)` : ""}.`
              : "No new orders to import.";
            setModal((m) => ({
              ...m,
              statusText: msg,
              completed: true,
              onCancel: undefined,
              onClose: () => {
                close();
                options?.onSuccess?.(result);
              },
            }));
          },
          onCancelled: (job: JobPollResult) => {
            const result = (job.result ?? {}) as EtsySyncSummary;
            close();
            options?.onCancelled?.(result);
          },
          onFailed: (error) => {
            const message = error.user_message ?? error.message ?? "Sync failed.";
            setModal((m) => ({
              ...m,
              error: message,
              userMessage: message,
              onRetry: () => {
                close();
                if (lastShopRef.current != null) void runSync(lastShopRef.current, options);
              },
              onClose: close,
            }));
            options?.onError?.(error);
          },
        });
      } catch (err) {
        if (err instanceof MutationQueuedError) {
          close();
          options?.onError?.(err);
          return;
        }
        const apiErr = err as ApiErrorShape;
        const message =
          apiErr?.error?.user_message ?? "We could not start Etsy sync. Try again in a moment.";
        setModal((m) => ({
          ...m,
          error: message,
          userMessage: message,
          onRetry: () => {
            close();
            if (lastShopRef.current != null) void runSync(lastShopRef.current, options);
          },
          onClose: close,
        }));
        options?.onError?.(err);
      } finally {
        setSyncing(false);
      }
    },
    [syncing, pollJob, cancelJob, close]
  );

  return { modal, syncing, runSync, close };
}
