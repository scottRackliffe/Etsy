"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  activityEntityHref,
  formatActivityAction,
  formatActivityTimestamp,
  type ActivityItem,
} from "@/lib/activity-display";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useEtsySync } from "@/hooks/useEtsySync";
import { useToast } from "@/hooks/useToast";

export function ActivityFeed({
  onViewAll,
  onSyncComplete,
}: {
  onViewAll?: () => void;
  onSyncComplete?: () => void;
}) {
  const { shops, selectedShopId, setBusyAction, setApiError } = useApp();
  const { modal: syncModal, runSync } = useEtsySync();
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/activity?limit=10", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as {
        items?: ActivityItem[];
      };
      if (!response.ok) {
        setLoadError("Could not load recent activity.");
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setLoadError("Could not load recent activity.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syncFromEtsy = () => {
    if (!selectedShopId) return;
    setBusyAction("sync-etsy");
    void runSync(selectedShopId, {
      onSuccess: async (result) => {
        await load();
        onSyncComplete?.();
        const synced = result.synced ?? 0;
        toast.showToast(
          synced > 0
            ? `Synced ${synced} order${synced !== 1 ? "s" : ""} from Etsy.`
            : "Etsy sync complete — no new orders to import.",
          synced > 0 ? "success" : "info"
        );
      },
      onError: (err) => {
        setApiError("Could not sync from Etsy", "We could not sync Etsy receipts.", err);
      },
    }).finally(() => setBusyAction(null));
  };

  return (
    <>
      <ProgressModal {...syncModal} />
      <section className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--ui-title)]">Recent activity</h3>
            <p className="text-sm text-[var(--ui-muted)]">
              Latest changes across orders, inventory, and customers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onViewAll ? (
              <Button variant="ghost" size="sm" onClick={onViewAll}>
                View all →
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-10 animate-pulse rounded-lg bg-[var(--ui-list-light)]" />
            ))}
          </div>
        ) : loadError ? (
          <p className="p-5 text-sm text-[var(--ui-red)]">{loadError}</p>
        ) : items.length === 0 ? (
          <EmptyState
            message="No recent activity. Start by adding inventory or syncing orders from Etsy."
            primaryAction={{ label: "Go to Inventory", onClick: () => router.push("/inventory") }}
            secondaryAction={
              shops.length > 0
                ? { label: "Sync from Etsy", onClick: () => void syncFromEtsy() }
                : {
                    label: "Connect Etsy first",
                    onClick: () => router.push("/config#etsy-connection"),
                    variant: "secondary",
                  }
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--ui-border)]/70">
            {items.map((entry) => {
              const href = activityEntityHref(entry.entity_type, entry.entity_id);
              return (
                <li key={entry.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-[var(--ui-title)]">
                      {formatActivityAction(entry.action)}
                    </p>
                    <time className="text-xs text-[var(--ui-muted)]">
                      {formatActivityTimestamp(entry.created_at)}
                    </time>
                  </div>
                  {entry.entity_label ? (
                    href ? (
                      <Link
                        href={href}
                        className="mt-0.5 text-xs text-[var(--ui-accent)] hover:underline"
                      >
                        {entry.entity_label}
                      </Link>
                    ) : (
                      <p className="mt-0.5 text-xs text-[var(--ui-body)]">{entry.entity_label}</p>
                    )
                  ) : null}
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--ui-muted)]">
                    {entry.source}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
