"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AppProvider, useApp } from "@/context/AppContext";
import { ConnectionProvider } from "@/context/ConnectionContext";
import { UnsavedChangesProvider } from "@/context/UnsavedChangesContext";
import { RecentlyViewedProvider } from "@/context/RecentlyViewedContext";
import { UndoRedoProvider, useUndoRedo } from "@/context/UndoRedoContext";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { IntegrityWarningBanner } from "@/components/shell/IntegrityWarningBanner";
import { StaleDataBadge } from "@/components/shell/StaleDataBadge";
import { MutationQueuedError } from "@/lib/api-fetch";
import { SetupWizard } from "@/components/onboarding/SetupWizard";
import { AppHeader } from "@/components/shell/AppHeader";
import { KeyboardShortcutsModal } from "@/components/shell/KeyboardShortcutsModal";
import { TabBar } from "@/components/shell/TabBar";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { GlobalSearchModal } from "@/components/search/GlobalSearchModal";
import { SkipLink } from "@/components/shell/SkipLink";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useEtsySync } from "@/hooks/useEtsySync";
import { useAutoEtsySync } from "@/hooks/useAutoEtsySync";
import { clearErrorNotifications } from "@/lib/notifications";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useToast } from "@/hooks/useToast";
import { formatUiErrorTimestamp } from "@/lib/ui-error";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { shops, loading, error, urlError, connect, setError, selectedShopId, setApiError } =
    useApp();
  const { modal: syncModal, runSync } = useEtsySync();
  const toast = useToast();
  const { undo, redo, canUndo, canRedo } = useUndoRedo();
  useAutoEtsySync({ connected: shops.length > 0, shopId: selectedShopId });
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && shops.length === 0) {
      clearErrorNotifications();
    }
  }, [loading, shops.length]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  useEffect(() => {
    if (shops.length === 0) return;
    const runScheduled = () => {
      void fetch("/api/backup/scheduled", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
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

  const syncFromEtsy = useCallback(() => {
    if (!selectedShopId) return;
    void runSync(selectedShopId, {
      onSuccess: (result) => {
        const synced = result.synced ?? 0;
        const skipped = result.skipped_already_imported ?? 0;
        setError({
          title: "Etsy sync complete",
          message: `Synced ${synced} orders${skipped > 0 ? ` (${skipped} already imported)` : ""}.`,
          actions: ["Open Sales to review imported orders."],
        });
      },
      onCancelled: (result) => {
        const processed = result.synced ?? 0;
        toast.showToast(
          processed > 0
            ? `Sync cancelled. ${processed} receipts were processed before cancel.`
            : "Sync cancelled.",
          "info"
        );
      },
      onError: (err) => {
        if (err instanceof MutationQueuedError) {
          setError({
            title: "Sync queued",
            message: err.message,
            actions: ["Sync will run automatically when connection returns."],
          });
          return;
        }
        setApiError("Could not sync from Etsy", "We could not sync Etsy receipts.", err);
      },
    });
  }, [selectedShopId, runSync, setApiError, setError, toast]);

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
      {
        key: "z",
        modifiers: ["meta" as const],
        action: () => void undo(),
        enabled: canUndo,
      },
      {
        key: "z",
        modifiers: ["meta" as const, "shift" as const],
        action: () => void redo(),
        enabled: canRedo,
      },
    ],
    [
      helpOpen,
      pathname,
      searchOpen,
      selectedShopId,
      shops.length,
      syncFromEtsy,
      undo,
      redo,
      canUndo,
      canRedo,
    ]
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="min-h-screen bg-[radial-gradient(70rem_45rem_at_10%_-10%,rgba(47,128,237,0.20),transparent_60%),radial-gradient(70rem_45rem_at_120%_10%,rgba(0,204,102,0.12),transparent_60%),var(--ui-background)] text-[var(--ui-body)]">
      <SkipLink />
      {setupChecked && showSetup ? <SetupWizard onDone={() => setShowSetup(false)} /> : null}
      <AppHeader onOpenSearch={() => setSearchOpen(true)} />
      <IntegrityWarningBanner />
      <OfflineBanner />
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ProgressModal {...syncModal} />
      <KeyboardShortcutsModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        pathname={pathname}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 outline-none"
      >
        {urlError && (
          <div className="rounded-xl border border-[var(--ui-yellow)]/50 bg-[var(--ui-yellow)]/10 px-4 py-3">
            <p className="font-semibold text-[var(--ui-yellow)]">{urlError.title}</p>
            {urlError.occurredAt ? (
              <p className="mt-0.5 text-[10px] text-[var(--ui-muted)]">
                {formatUiErrorTimestamp(urlError.occurredAt)}
              </p>
            ) : null}
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

        {!loading && shops.length === 0 && (
          <div className="rounded-xl border border-[var(--ui-yellow)]/40 bg-[var(--ui-yellow)]/10 px-4 py-3">
            <p className="text-sm font-medium text-[var(--ui-yellow)]">
              Local mode — Etsy not connected
            </p>
            <p className="mt-1 text-sm text-[var(--ui-body)]">
              Your API key may still be pending approval. Use Config → Sample Data to explore
              inventory, customers, and orders locally. Connect Etsy when your key is active to
              sync.
            </p>
            <button
              type="button"
              onClick={connect}
              className="mt-3 rounded-lg bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Connect Etsy
            </button>
          </div>
        )}

        {!loading && (
          <>
            {!pathname.startsWith("/listing-coach") ? (
              <>
                <TabBar />
                <div className="flex justify-end">
                  <StaleDataBadge />
                </div>
              </>
            ) : null}
            {children}
            {error && <ErrorPanel error={error} onDismiss={() => setError(null)} />}
            {!pathname.startsWith("/listing-coach") ? (
              <div className="text-xs text-[var(--ui-muted)]">
                The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This application uses the
                Etsy API but is not endorsed or certified by Etsy, Inc.
              </div>
            ) : null}
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
          <RecentlyViewedProvider>
            <UndoRedoProvider>
              <AppShellInner>{children}</AppShellInner>
            </UndoRedoProvider>
          </RecentlyViewedProvider>
        </UnsavedChangesProvider>
      </ConnectionProvider>
    </AppProvider>
  );
}
