"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { summarizeBatchResult, type BatchApiResult } from "@/lib/batch-result";
import type { ApiErrorShape } from "@/types";

type BatchFeedback = {
  title: string;
  message: string;
  variant: "success" | "warning" | "error";
};

export function useBatchOperation() {
  const [busy, setBusy] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressTitle, setProgressTitle] = useState("");
  const [progressTotal, setProgressTotal] = useState(0);

  const runBatch = useCallback(
    async (
      url: string,
      body: Record<string, unknown>,
      labels: { entity: string; actionPast: string; count: number }
    ): Promise<{ ok: boolean; feedback: BatchFeedback; result?: BatchApiResult }> => {
      setBusy(true);
      const showProgress = labels.count > 10;
      if (showProgress) {
        setProgressTitle(`Processing ${labels.count} ${labels.entity}s…`);
        setProgressTotal(labels.count);
        setProgressOpen(true);
      }
      try {
        const response = await apiFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as ApiErrorShape & BatchApiResult;
        if (!response.ok) throw data;
        const feedback = summarizeBatchResult(data, labels.entity, labels.actionPast);
        return { ok: true, feedback, result: data };
      } catch (err) {
        const apiErr = err as ApiErrorShape;
        return {
          ok: false,
          feedback: {
            variant: "error",
            title: `Batch ${labels.actionPast} failed`,
            message:
              apiErr?.error?.user_message ??
              "We could not complete the batch operation. Try again in a moment.",
          },
        };
      } finally {
        setBusy(false);
        if (showProgress) setProgressOpen(false);
      }
    },
    []
  );

  return {
    busy,
    progressOpen,
    progressTitle,
    progressTotal,
    runBatch,
  };
}
