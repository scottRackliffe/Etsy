"use client";

import { useState } from "react";
import Image from "next/image";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NotificationCenter } from "@/components/shell/NotificationCenter";
import { RecentlyViewedMenu } from "@/components/shell/RecentlyViewedMenu";
import { PrintQueueMenu } from "@/components/shell/PrintQueueMenu";

export function AppHeader({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { shops, iconConfig, connect, logout } = useApp();
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const screenHeaderIconSize = Number.isFinite(Number(iconConfig.screenHeaderSizePx))
    ? Math.max(16, Math.min(256, Math.floor(Number(iconConfig.screenHeaderSizePx))))
    : 32;

  const statusBadgeClass = shops.length
    ? "border-[var(--ui-green)]/30 bg-[var(--ui-green)]/10 text-[var(--ui-green)]"
    : "border-[var(--ui-yellow)]/30 bg-[var(--ui-yellow)]/10 text-[var(--ui-yellow)]";

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--ui-border)]/80 bg-[color:var(--ui-panel-bg)]/90 px-4 py-3 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image
            src={iconConfig.screenHeaderPath || "/brand/aice-dark.png"}
            alt="AiCE"
            width={200}
            height={60}
            className="h-10 w-auto object-contain"
          />
          <p className="text-xs text-[var(--ui-muted)]">The AI-Powered eCommerce Engine</p>
        </div>
        <div className="flex items-center gap-3">
          <NotificationCenter />
          {onOpenSearch ? (
            <button
              type="button"
              onClick={onOpenSearch}
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-neutral)] p-2 text-[var(--ui-body)] shadow-sm transition hover:bg-[var(--ui-neutral-hover)]"
              aria-label="Search (Cmd+K)"
              title="Search (Cmd+K)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
          ) : null}
          <RecentlyViewedMenu />
          <PrintQueueMenu />
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass}`}
          >
            {shops.length ? "Connected" : "Not connected"}
          </span>
          {shops.length > 0 ? (
            <Button variant="secondary" size="lg" onClick={() => setDisconnectOpen(true)}>
              Disconnect
            </Button>
          ) : (
            <Button variant="accent" size="lg" onClick={connect}>
              Connect Etsy
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={() => {
          setDisconnectOpen(false);
          logout();
        }}
        title="Disconnect Etsy?"
        description="This will clear your Etsy tokens. You will need to reconnect to sync orders or publish listings."
        confirmLabel="Disconnect"
        confirmVariant="danger"
      />
    </header>
  );
}
