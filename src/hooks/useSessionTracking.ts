"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_ENDPOINT = "/api/usage/session";

function sendSessionAction(action: string, service: string): void {
  const body = JSON.stringify({ action, service });

  if (action === "end" && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon(SESSION_ENDPOINT, body);
    return;
  }

  void fetch(SESSION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
}

/**
 * Tracks browser session time for a connected service.
 * Starts a session on mount, sends heartbeats every 5 minutes,
 * and ends the session on page unload.
 *
 * @param service - Service name (e.g. "etsy")
 * @param connected - Whether the service is currently connected
 */
export function useSessionTracking(service: string, connected: boolean): void {
  const activeRef = useRef(false);

  useEffect(() => {
    if (!connected) return;

    sendSessionAction("start", service);
    activeRef.current = true;

    const heartbeat = window.setInterval(() => {
      sendSessionAction("heartbeat", service);
    }, HEARTBEAT_INTERVAL_MS);

    const handleUnload = () => {
      if (activeRef.current) {
        sendSessionAction("end", service);
        activeRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendSessionAction("heartbeat", service);
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (activeRef.current) {
        sendSessionAction("end", service);
        activeRef.current = false;
      }
    };
  }, [service, connected]);
}
