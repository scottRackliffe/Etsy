"use client";

import { useEffect, useState } from "react";

export function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const [activeSession, setActiveSession] = useState(active);

  if (active !== activeSession) {
    setActiveSession(active);
    if (active) setElapsed(0);
  }

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, activeSession]);

  return active ? elapsed : 0;
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins} min ${secs}s`;
}
