"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@/context/ConnectionContext";

export function OfflineBanner() {
  const { state, queueLength, replaying } = useConnection();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || state === "online") return null;

  const message =
    state === "offline"
      ? "You are offline. Changes will be saved when connection returns."
      : replaying
        ? "Cannot reach server. Syncing pending changes..."
        : "Cannot reach server. Retrying...";

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-[var(--ui-yellow)]/40 bg-[var(--ui-yellow)]/15 px-4 py-2 text-center text-sm text-[var(--ui-yellow)]"
    >
      <span>{message}</span>
      {queueLength > 0 ? (
        <span className="ml-2 text-[var(--ui-body)]">
          ({queueLength} pending change{queueLength === 1 ? "" : "s"})
        </span>
      ) : null}
    </div>
  );
}
