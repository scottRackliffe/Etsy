"use client";

import { useEffect, useState } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import { UnsavedChangesProvider } from "@/context/UnsavedChangesContext";
import { AppHeader } from "@/components/shell/AppHeader";
import { TabBar } from "@/components/shell/TabBar";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { GlobalSearchModal } from "@/components/search/GlobalSearchModal";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { shops, loading, error, urlError, connect, setError } = useApp();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (searchOpen) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest("[role='dialog']")) return;
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [searchOpen]);

  useEffect(() => {
    if (shops.length === 0) return;
    const runScheduled = () => {
      void fetch("/api/backup/scheduled", { method: "POST", headers: { Accept: "application/json" } });
    };
    runScheduled();
    const timer = window.setInterval(runScheduled, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [shops.length]);

  return (
    <div className="min-h-screen bg-[radial-gradient(70rem_45rem_at_10%_-10%,rgba(47,128,237,0.20),transparent_60%),radial-gradient(70rem_45rem_at_120%_10%,rgba(0,204,102,0.12),transparent_60%),var(--ui-background)] text-[var(--ui-body)]">
      <AppHeader onOpenSearch={() => setSearchOpen(true)} />
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        {urlError && (
          <div className="rounded-xl border border-[var(--ui-yellow)]/50 bg-[var(--ui-yellow)]/10 px-4 py-3">
            <p className="font-semibold text-[var(--ui-yellow)]">{urlError.title}</p>
            <p className="mt-1 text-[var(--ui-yellow)]">{urlError.message}</p>
            {urlError.actions.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ui-yellow)]">
                {urlError.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-8 text-center">
            <p className="text-[var(--ui-muted)]">Checking connection...</p>
          </div>
        )}

        {!loading && shops.length === 0 && !error && (
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-10 text-center shadow-sm">
            <h2 className="mb-2 text-xl font-semibold text-[var(--ui-title)]">
              Welcome to your Etsy command center
            </h2>
            <p className="mb-6 text-[var(--ui-muted)]">
              Connect your Etsy account to view recent orders, shipping status, and totals in one clean workspace.
            </p>
            <button
              type="button"
              onClick={connect}
              className="rounded-lg bg-[var(--ui-accent)] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[var(--ui-accent-hover)]"
            >
              Connect with Etsy
            </button>
          </div>
        )}

        {error && shops.length === 0 && (
          <ErrorPanel error={error} onDismiss={() => setError(null)} />
        )}

        {shops.length > 0 && (
          <>
            <TabBar />
            {children}
            {error && <ErrorPanel error={error} onDismiss={() => setError(null)} />}
            <div className="text-xs text-[var(--ui-muted)]">
              UI quality baseline: clean hierarchy, fast scanning, clear status, and minimal-friction actions.
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <UnsavedChangesProvider>
        <AppShellInner>{children}</AppShellInner>
      </UnsavedChangesProvider>
    </AppProvider>
  );
}
