export type AutoSyncInterval = "off" | "5min" | "15min" | "30min" | "1hour";

export const AUTO_SYNC_OPTIONS: Array<{ value: AutoSyncInterval; label: string }> = [
  { value: "off", label: "Off" },
  { value: "5min", label: "Every 5 minutes" },
  { value: "15min", label: "Every 15 minutes" },
  { value: "30min", label: "Every 30 minutes" },
  { value: "1hour", label: "Every hour" },
];

export const AUTO_SYNC_MS: Record<Exclude<AutoSyncInterval, "off">, number> = {
  "5min": 300_000,
  "15min": 900_000,
  "30min": 1_800_000,
  "1hour": 3_600_000,
};

export function autoSyncLabel(value: AutoSyncInterval): string {
  return AUTO_SYNC_OPTIONS.find((o) => o.value === value)?.label ?? "Off";
}

export function parseAutoSyncInterval(raw: string | null | undefined): AutoSyncInterval {
  if (raw === "5min" || raw === "15min" || raw === "30min" || raw === "1hour") return raw;
  return "off";
}
