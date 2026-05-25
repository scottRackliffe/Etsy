export type ConnectionState = "online" | "server-unreachable" | "offline";

let connectionState: ConnectionState = "online";

export const CONNECTION_CHANGED_EVENT = "esm-connection-changed";

export function getConnectionState(): ConnectionState {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  return connectionState;
}

export function setConnectionState(next: ConnectionState): void {
  if (connectionState === next) return;
  connectionState = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CONNECTION_CHANGED_EVENT, { detail: next }));
  }
}

export function isAppReachable(): boolean {
  return getConnectionState() === "online";
}
