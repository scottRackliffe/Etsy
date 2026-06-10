"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_SYNC_MS,
  parseAutoSyncInterval,
  type AutoSyncInterval,
} from "@/lib/auto-sync-interval";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { useToast } from "@/hooks/useToast";

const POLL_MS = 2000;

async function waitForJob(jobId: string): Promise<{ ok: boolean; status: string }> {
  for (;;) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Accept: "application/json" },
    });
    const data = (await response.json().catch(() => ({}))) as {
      status?: string;
    };
    if (!response.ok) return { ok: false, status: "failed" };
    if (data.status === "completed") return { ok: true, status: "completed" };
    if (data.status === "failed" || data.status === "cancelled") {
      return { ok: false, status: data.status ?? "failed" };
    }
    await new Promise((r) => window.setTimeout(r, POLL_MS));
  }
}

const SETTING_REFRESH_MS = 60_000;

export function useAutoEtsySync({
  connected,
  shopId,
}: {
  connected: boolean;
  shopId: number | null;
}) {
  const { showToast } = useToast();
  const { state: connectionState } = useConnectionStatus();
  const [interval, setIntervalSetting] = useState<AutoSyncInterval>("off");
  const [loaded, setLoaded] = useState(false);
  const failuresRef = useRef(0);
  const warnedRef = useRef(false);
  const runningRef = useRef(false);

  const loadIntervalSetting = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/sync.auto_interval", {
        headers: { Accept: "application/json" },
      });
      if (response.status === 404) {
        setIntervalSetting("off");
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { value?: string };
      if (response.ok) setIntervalSetting(parseAutoSyncInterval(data.value));
    } catch {
      setIntervalSetting("off");
    }
  }, []);

  useEffect(() => {
    void loadIntervalSetting().finally(() => setLoaded(true));
  }, [loadIntervalSetting]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setInterval(() => void loadIntervalSetting(), SETTING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loaded, loadIntervalSetting]);

  const runSilentSync = useCallback(async () => {
    if (!shopId || runningRef.current || connectionState !== "online") return;
    runningRef.current = true;
    try {
      const response = await fetch("/api/sync/etsy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ shop_id: shopId }),
      });
      if (response.status === 409) return;
      const data = (await response.json().catch(() => ({}))) as { job_id?: string };
      if (response.status !== 202 || !data.job_id) throw new Error("sync start failed");
      const result = await waitForJob(data.job_id);
      if (!result.ok) throw new Error(result.status);
      failuresRef.current = 0;
      warnedRef.current = false;
    } catch {
      failuresRef.current += 1;
      if (failuresRef.current >= 3 && !warnedRef.current) {
        warnedRef.current = true;
        showToast("Auto-sync failing. Check your Etsy connection.", "warning");
      }
    } finally {
      runningRef.current = false;
    }
  }, [shopId, showToast, connectionState]);

  useEffect(() => {
    if (!loaded || !connected || !shopId || interval === "off") return;
    const ms = AUTO_SYNC_MS[interval];
    const timer = window.setInterval(() => void runSilentSync(), ms);
    return () => window.clearInterval(timer);
  }, [loaded, connected, shopId, interval, runSilentSync]);

  return { interval, loaded };
}
