"use client";

import { useConnection } from "@/context/ConnectionContext";

export function StaleDataBadge() {
  const { state } = useConnection();
  if (state === "online") return null;

  return (
    <span className="inline-flex items-center rounded-full border border-[var(--ui-yellow)]/50 bg-[var(--ui-yellow)]/10 px-2 py-0.5 text-xs font-medium text-[var(--ui-yellow)]">
      Data may be outdated
    </span>
  );
}
