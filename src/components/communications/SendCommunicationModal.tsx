"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api-fetch";

type Channel = "email" | "print";
type MessageType = "payment_reminder" | "thank_you";

type PreviewData = {
  subject: string;
  body: string;
  channel_default: Channel;
  unknown_tokens: string[];
};

type SendItemResult = {
  order_id: number;
  status: string;
  error?: string;
};

type Props = {
  type: MessageType;
  orderIds: number[];
  channel: Channel;
  onClose: () => void;
  onSent: (results: SendItemResult[]) => void;
};

export function SendCommunicationModal({ type, orderIds, channel, onClose, onSent }: Props) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load preview for first order
  const loadPreview = useCallback(async () => {
    if (orderIds.length === 0) return;
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await apiFetch("/api/communications/preview", {
        method: "POST",
        body: JSON.stringify({ type, order_id: orderIds[0] }),
      });
      const data = (await res.json()) as { ok: boolean; subject?: string; body?: string; channel_default?: Channel; unknown_tokens?: string[]; error?: { user_message?: string } };
      if (!res.ok || !data.ok) {
        setError(data.error?.user_message ?? "Could not load preview.");
        return;
      }
      setPreview({
        subject: data.subject ?? "",
        body: data.body ?? "",
        channel_default: data.channel_default ?? channel,
        unknown_tokens: data.unknown_tokens ?? [],
      });
    } catch {
      setError("Could not load preview.");
    } finally {
      setLoadingPreview(false);
    }
  }, [type, orderIds, channel]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch("/api/communications/send", {
        method: "POST",
        body: JSON.stringify({ type, channel, order_ids: orderIds }),
      });
      const data = (await res.json()) as { ok: boolean; results?: SendItemResult[]; error?: { user_message?: string } };
      if (!res.ok || !data.ok) {
        setError(data.error?.user_message ?? "Could not send messages.");
        return;
      }
      onSent(data.results ?? []);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-[var(--ui-title)]">
          Preview &amp; Send ({orderIds.length} order{orderIds.length !== 1 ? "s" : ""})
        </h2>

        {loadingPreview && (
          <p className="text-sm text-[var(--ui-muted)]">Loading preview…</p>
        )}

        {!loadingPreview && preview && (
          <div className="mb-4 space-y-3">
            {preview.unknown_tokens.length > 0 && (
              <p className="rounded-lg border border-[var(--ui-yellow)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-yellow)]">
                Unknown tokens left verbatim: {preview.unknown_tokens.join(", ")}
              </p>
            )}
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--ui-muted)]">Subject</p>
              <p className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-body)]">
                {preview.subject || "(no subject)"}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--ui-muted)]">Body</p>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-body)]">
                {preview.body}
              </pre>
            </div>
            <p className="text-xs text-[var(--ui-muted)]">
              Channel: <span className="capitalize text-[var(--ui-body)]">{channel}</span>
              {orderIds.length > 1 && " — each order uses its own customer data"}
            </p>
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-lg border border-[var(--ui-red)] bg-[var(--ui-card-bg)] px-3 py-2 text-sm text-[var(--ui-red)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSend()}
            disabled={sending || loadingPreview}
          >
            {sending ? "Sending…" : `Send ${channel === "email" ? "Email" : "to Print Queue"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
