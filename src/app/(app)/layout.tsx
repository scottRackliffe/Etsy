"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AppProvider, useApp } from "@/context/AppContext";
import { ConnectionProvider } from "@/context/ConnectionContext";
import { UnsavedChangesProvider } from "@/context/UnsavedChangesContext";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { StaleDataBadge } from "@/components/shell/StaleDataBadge";
import { apiFetch, MutationQueuedError } from "@/lib/api-fetch";
import { SetupWizard } from "@/components/onboarding/SetupWizard";
import { AppHeader } from "@/components/shell/AppHeader";
import { KeyboardShortcutsModal } from "@/components/shell/KeyboardShortcutsModal";
import { TabBar } from "@/components/shell/TabBar";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { GlobalSearchModal } from "@/components/search/GlobalSearchModal";
import { SkipLink } from "@/components/shell/SkipLink";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { shops, loading, error, urlError, connect, setError, selectedShopId, setApiError } = useApp();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

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

  useEffect(() => {
    if (loading) return;
    void (async () => {
      try {
        const response = await fetch("/api/settings/setup.completed", {
          headers: { Accept: "application/json" },
        });
        if (response.status === 404) {
          setShowSetup(true);
        } else if (response.ok) {
          const data = (await response.json()) as { value?: string };
          setShowSetup(data.value !== "true");
        }
      } catch {
        setShowSetup(false);
      } finally {
        setSetupChecked(true);
      }
    })();
  }, [loading]);

  const syncFromEtsy = useCallback(async () => {
    if (!selectedShopId) return;
    try {
      const response = await apiFetch("/api/sync/etsy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ shop_id: selectedShopId, limit: 100 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw data;
      setError({
        title: "Etsy sync complete",
        message: "Orders were synchronized from Etsy.",
        actions: ["Open Sales to review imported orders."],
      });
    } catch (err) {
      if (err instanceof MutationQueuedError) {
        setError({
          title: "Sync queued",
          message: err.message,
          actions: ["Sync will run automatically when connection returns."],
        });
        return;
      }
      setApiError("Could not sync from Etsy", "We could not sync Etsy receipts.", err);
    }
  }, [selectedShopId, setApiError, setError]);

  const shortcuts = useMemo(
    () => [
      {
        key: "k",
        modifiers: ["meta" as const],
        action: () => setSearchOpen(true),
        enabled: !searchOpen,
      },
      {
        key: "?",
        action: () => setHelpOpen(true),
      },
      {
        key: "Escape",
        action: () => {
          if (helpOpen) setHelpOpen(false);
          else if (searchOpen) setSearchOpen(false);
        },
        allowInInput: true,
      },
      {
        key: "s",
        modifiers: ["meta" as const, "shift" as const],
        action: () => void syncFromEtsy(),
        enabled:
          shops.length > 0 &&
          Boolean(selectedShopId) &&
          (pathname.startsWith("/dashboard") || pathname.startsWith("/sales")),
      },
    ],
    [helpOpen, pathname, searchOpen, selectedShopId, shops.length, syncFromEtsy]
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="min-h-screen bg-[radial-gradient(70rem_45rem_at_10%_-10%,rgba(47,128,237,0.20),transparent_60%),radial-gradient(70rem_45rem_at_120%_10%,rgba(0,204,102,0.12),transparent_60%),var(--ui-background)] text-[var(--ui-body)]">
      <SkipLink />
      {setupChecked && showSetup ? <SetupWizard onDone={() => setShowSetup(false)} /> : null}
      <AppHeader onOpenSearch={() => setSearchOpen(true)} />
      <OfflineBanner />
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} pathname={pathname} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 outline-none"
      >
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
            <div className="flex justify-end">
              <StaleDataBadge />
            </div>
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
      <ConnectionProvider>
        <UnsavedChangesProvider>
          <AppShellInner>{children}</AppShellInner>
        </UnsavedChangesProvider>
      </ConnectionProvider>
    </AppProvider>
  );
}
