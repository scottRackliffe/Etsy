"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import type { ConnectionState } from "@/lib/connection-state";

type ConnectionContextValue = {
  state: ConnectionState;
  queueLength: number;
  replaying: boolean;
  refreshConnection: () => Promise<void>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const value = useConnectionStatus();
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}
