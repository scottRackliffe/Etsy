"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function IntegrityWarningBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/integrity_warning", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) {
          setActive(false);
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as { value?: string };
        setActive(data.value === "true");
      })
      .catch(() => {
        if (!cancelled) setActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!active) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-b border-[var(--ui-red)]/50 bg-[var(--ui-red)]/20 px-4 py-2 text-center text-sm text-[var(--ui-red)]"
    >
      Database integrity issue detected. Please restore from backup (
      <Link href="/settings#backup-restore" className="underline underline-offset-2">
        Settings → Backup &amp; Restore
      </Link>
      ).
    </div>
  );
}
