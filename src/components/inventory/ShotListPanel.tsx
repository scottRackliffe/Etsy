"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api-fetch";

export type ShotListItem = {
  shot_type: string;
  name: string;
  purpose: string;
  pass_spec: string;
  tips: string;
  required: boolean;
  captured: boolean;
};

type Props = {
  inventoryId: number | null;
  /** Used to re-derive captured flags when pictures change. */
  itemVersion?: string | null;
  disabled?: boolean;
  onError: (title: string, message: string, err?: unknown) => void;
};

const SHOT_TYPE_LABEL: Record<string, string> = {
  hero: "Hero",
  angle: "Angle",
  detail: "Detail",
  backstamp: "Backstamp",
  scale: "Scale",
  imperfection: "Imperfection",
  underside: "Underside",
  grouping: "Grouping",
  lifestyle: "Lifestyle",
  measurement: "Measurement",
  extra: "Extra",
};

export function ShotListPanel({ inventoryId, itemVersion, disabled, onError }: Props) {
  const [shots, setShots] = useState<ShotListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!inventoryId) {
      setShots(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/${inventoryId}/shot-list`);
      const data = (await res.json().catch(() => ({}))) as { shot_list?: ShotListItem[] | null };
      if (!res.ok) throw data;
      setShots(data.shot_list ?? null);
    } catch (err) {
      // A missing list is not an error; only surface real failures.
      setShots(null);
    } finally {
      setLoading(false);
    }
  }, [inventoryId]);

  useEffect(() => {
    void load();
  }, [load, itemVersion]);

  const generate = useCallback(async () => {
    if (!inventoryId) return;
    setGenerating(true);
    try {
      const res = await apiFetch(`/api/inventory/${inventoryId}/shot-list`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        shot_list?: ShotListItem[];
        error?: { user_message?: string; message?: string };
      };
      if (!res.ok) {
        const msg = data.error?.user_message || data.error?.message || "We could not generate a shot list.";
        onError("Shot list failed", msg, data);
        return;
      }
      setShots(data.shot_list ?? null);
    } catch (err) {
      onError("Shot list failed", "We could not generate a shot list.", err);
    } finally {
      setGenerating(false);
    }
  }, [inventoryId, onError]);

  if (!inventoryId) return null;

  const required = (shots ?? []).filter((s) => s.required);
  const recommended = (shots ?? []).filter((s) => !s.required);
  const capturedCount = (shots ?? []).filter((s) => s.captured).length;
  const total = shots?.length ?? 0;

  return (
    <section
      id="shot-list"
      className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ui-title)]">AI shot list</h3>
          <p className="text-xs text-[var(--ui-muted)]">
            {total > 0
              ? `${capturedCount} of ${total} shots captured`
              : "Generate a tailored checklist of photos this item needs."}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void generate()}
          disabled={disabled || generating || loading}
        >
          {generating ? "Generating…" : total > 0 ? "Regenerate" : "Generate shot list"}
        </Button>
      </div>

      {total > 0 ? (
        <div className="mt-4 space-y-4">
          <ShotGroup title="Required" items={required} />
          <ShotGroup title="Recommended" items={recommended} />
        </div>
      ) : null}
    </section>
  );
}

function ShotGroup({ title, items }: { title: string; items: ShotListItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
        {title}
      </div>
      <ul className="space-y-2">
        {items.map((shot, idx) => (
          <li
            key={`${shot.shot_type}-${idx}`}
            className="flex gap-3 rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel-bg)] p-3"
          >
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{
                backgroundColor: shot.captured ? "var(--ui-green)" : "transparent",
                border: shot.captured ? "none" : "1px solid var(--ui-border)",
                color: shot.captured ? "#06371f" : "var(--ui-muted)",
              }}
            >
              {shot.captured ? "\u2713" : ""}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--ui-title)]">{shot.name}</span>
                <span className="rounded bg-[var(--ui-neutral)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--ui-body)]">
                  {SHOT_TYPE_LABEL[shot.shot_type] ?? shot.shot_type}
                </span>
                {shot.captured ? (
                  <span className="text-[10px] font-semibold uppercase text-[var(--ui-green)]">
                    Captured
                  </span>
                ) : null}
              </div>
              {shot.purpose ? (
                <p className="mt-1 text-xs text-[var(--ui-body)]">{shot.purpose}</p>
              ) : null}
              {shot.pass_spec ? (
                <p className="mt-1 text-xs text-[var(--ui-muted)]">
                  <span className="font-semibold">Pass: </span>
                  {shot.pass_spec}
                </p>
              ) : null}
              {shot.tips ? (
                <p className="mt-1 text-xs text-[var(--ui-muted)]">
                  <span className="font-semibold">Tip: </span>
                  {shot.tips}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
