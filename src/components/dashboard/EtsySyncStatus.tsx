"use client";

import { autoSyncLabel, parseAutoSyncInterval } from "@/lib/auto-sync-interval";
import { useEffect, useState } from "react";

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function EtsySyncStatus({ connected }: { connected: boolean }) {
  const [autoInterval, setAutoInterval] = useState("off");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [intervalRes, infoRes] = await Promise.all([
          fetch("/api/settings/sync.auto_interval", { headers: { Accept: "application/json" } }),
          fetch("/api/auth/etsy/info", { headers: { Accept: "application/json" } }),
        ]);
        if (intervalRes.ok) {
          const data = (await intervalRes.json()) as { value?: string };
          setAutoInterval(parseAutoSyncInterval(data.value));
        } else {
          setAutoInterval("off");
        }
        if (infoRes.ok) {
          const info = (await infoRes.json()) as { last_etsy_sync_at?: string | null };
          setLastSync(info.last_etsy_sync_at ?? null);
        }
      } catch {
        /* optional widget */
      } finally {
        setLoading(false);
      }
    })();
  }, [connected]);

  if (!connected) return null;

  const interval = parseAutoSyncInterval(autoInterval);

  return (
    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-3 text-sm">
      <p className="font-medium text-[var(--ui-title)]">Etsy sync</p>
      <p className="mt-1 text-xs text-[var(--ui-muted)]">
        Auto-sync:{" "}
        <span className="text-[var(--ui-body)]">
          {loading ? "…" : interval === "off" ? "off" : autoSyncLabel(interval).replace("Every ", "every ")}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-[var(--ui-muted)]">
        Last synced:{" "}
        <span className="text-[var(--ui-body)]">{loading ? "…" : formatTimestamp(lastSync)}</span>
      </p>
    </div>
  );
}
