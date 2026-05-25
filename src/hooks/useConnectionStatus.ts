"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CONNECTION_CHANGED_EVENT,
  getConnectionState,
  setConnectionState,
  type ConnectionState,
} from "@/lib/connection-state";
import { MUTATION_QUEUE_CHANGED_EVENT, mutationQueueLength } from "@/lib/mutation-queue";
import { addNotificationEntry } from "@/lib/notifications";
import { replayMutationQueue } from "@/lib/replay-mutation-queue";

const HEALTH_INTERVAL_MS = 30_000;
const HEALTH_TIMEOUT_MS = 5_000;

async function pingHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch("/api/health", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export function useConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(() => getConnectionState());
  const [queueLength, setQueueLength] = useState(0);
  const [replaying, setReplaying] = useState(false);

  const refreshQueueLength = useCallback(() => {
    setQueueLength(mutationQueueLength());
  }, []);

  const runReplay = useCallback(async () => {
    const pending = mutationQueueLength();
    if (pending === 0) return;
    setReplaying(true);
    addNotificationEntry({
      type: "info",
      message: `Syncing ${pending} pending change${pending === 1 ? "" : "s"}...`,
    });
    try {
      await replayMutationQueue();
    } finally {
      setReplaying(false);
      refreshQueueLength();
    }
  }, [refreshQueueLength]);

  const evaluateConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setConnectionState("offline");
      setState("offline");
      return;
    }

    const healthy = await pingHealth();
    const prev = getConnectionState();
    if (healthy) {
      setConnectionState("online");
      setState("online");
      if (prev !== "online") {
        await runReplay();
      }
    } else {
      setConnectionState("server-unreachable");
      setState("server-unreachable");
    }
  }, [runReplay]);

  useEffect(() => {
    refreshQueueLength();

    const onConnectionEvent = () => setState(getConnectionState());
    const onQueueEvent = () => refreshQueueLength();

    window.addEventListener(CONNECTION_CHANGED_EVENT, onConnectionEvent);
    window.addEventListener(MUTATION_QUEUE_CHANGED_EVENT, onQueueEvent);
    const onBrowserOffline = () => {
      setConnectionState("offline");
      setState("offline");
    };
    window.addEventListener("online", evaluateConnection);
    window.addEventListener("offline", onBrowserOffline);

    void evaluateConnection();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void evaluateConnection();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void evaluateConnection();
    }, HEALTH_INTERVAL_MS);

    return () => {
      window.removeEventListener(CONNECTION_CHANGED_EVENT, onConnectionEvent);
      window.removeEventListener(MUTATION_QUEUE_CHANGED_EVENT, onQueueEvent);
      window.removeEventListener("online", evaluateConnection);
      window.removeEventListener("offline", onBrowserOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [evaluateConnection, refreshQueueLength]);

  return { state, queueLength, replaying, refreshConnection: evaluateConnection };
}
