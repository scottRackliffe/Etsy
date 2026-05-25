"use client";

import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { ProgressModalState } from "@/components/ui/ProgressModal";

const POLL_MS = 2000;

export type JobPollResult = {
  job_id: string;
  status: string;
  progress?: { current: number; total: number; message: string };
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string; user_message?: string };
};

type PollCallbacks = {
  onProgress: (progress: { current: number; total: number; message: string }) => void;
  onComplete: (result: JobPollResult) => void;
  onFailed: (error: { user_message?: string; message?: string }) => void;
  onCancelled: (result: JobPollResult) => void;
};

export function useJobPoll() {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    (jobId: string, callbacks: PollCallbacks): Promise<JobPollResult> => {
      stopPolling();

      return new Promise((resolve, reject) => {
        const tick = async () => {
          try {
            const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
              headers: { Accept: "application/json" },
            });
            const data = (await response.json().catch(() => ({}))) as JobPollResult & {
              ok?: boolean;
              error?: { user_message?: string; message?: string };
            };

            if (!response.ok) {
              stopPolling();
              reject(data);
              return;
            }

            if (data.progress) {
              callbacks.onProgress(data.progress);
            }

            if (data.status === "completed") {
              stopPolling();
              callbacks.onComplete(data);
              resolve(data);
              return;
            }

            if (data.status === "failed") {
              stopPolling();
              const err = data.error ?? { user_message: "The operation failed." };
              callbacks.onFailed(err);
              reject(err);
              return;
            }

            if (data.status === "cancelled") {
              stopPolling();
              callbacks.onCancelled(data);
              resolve(data);
            }
          } catch (err) {
            stopPolling();
            reject(err);
          }
        };

        void tick();
        pollRef.current = setInterval(() => void tick(), POLL_MS);
      });
    },
    [stopPolling]
  );

  const cancelJob = useCallback(
    async (jobId: string) => {
      stopPolling();
      await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
    },
    [stopPolling]
  );

  return { pollJob, cancelJob, stopPolling };
}

export function applyJobProgressToModal(
  setModal: Dispatch<SetStateAction<ProgressModalState>>,
  progress: { current: number; total: number; message: string }
): void {
  setModal((m) => ({
    ...m,
    mode: progress.total > 0 ? "determinate" : "indeterminate",
    current: progress.current,
    total: progress.total,
    statusText: progress.message,
  }));
}
