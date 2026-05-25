import type Database from "better-sqlite3";
import { logActivity } from "@/lib/activity-log";
import { logger } from "@/lib/logging";
import { getSetting, setSetting } from "@/lib/settings-store";

const INTEGRITY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function runQuickCheckOnDb(db: Database.Database): boolean {
  const row = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
  return row?.quick_check === "ok";
}

export function runIntegrityCheckOnDb(db: Database.Database): { ok: boolean; details: string[] } {
  const rows = db.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check?: string }>;
  const details = rows.map((row) => row.integrity_check ?? "").filter(Boolean);
  const ok = details.length === 1 && details[0] === "ok";
  return { ok, details };
}

export function isIntegrityWarningActive(): boolean {
  return getSetting("integrity_warning") === "true";
}

function integrityCheckIsDue(): boolean {
  if (isIntegrityWarningActive()) return true;
  const raw = getSetting("last_integrity_check");
  if (!raw) return true;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts >= INTEGRITY_INTERVAL_MS;
}

let startupIntegrityDone = false;

export function runStartupIntegrityCheckIfDue(db: Database.Database): void {
  if (startupIntegrityDone) return;
  startupIntegrityDone = true;

  if (!integrityCheckIsDue()) return;

  const { ok, details } = runIntegrityCheckOnDb(db);
  const now = new Date().toISOString();

  if (ok) {
    setSetting("last_integrity_check", now);
    if (isIntegrityWarningActive()) {
      setSetting("integrity_warning", "");
    }
    return;
  }

  logger.error("SQLite integrity check failed", { critical: true, details });
  setSetting("integrity_warning", "true");
  setSetting("last_integrity_check", now);

  logActivity({
    action: "system.integrity_check_failed",
    entityType: "system",
    entityLabel: "Database integrity",
    detail: { details },
    source: "system",
  });
}
