import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { ApiRouteError } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { logger } from "@/lib/logging";
import { getSetting, setSetting } from "@/lib/settings-store";
import { runQuickCheckOnDb } from "@/lib/sqlite-integrity";
import { getSqliteDatabasePath, getDb, resetSqliteConnection } from "@/lib/sqlite";

const BACKUP_FILE_RE = /^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sqlite$/;

export type BackupEntry = {
  filename: string;
  created_at: string;
  size_bytes: number;
};

function utcTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
}

export function getBackupDirectory(): string {
  const configured = getSetting("backup_directory")?.trim();
  const dir = configured && configured.length > 0 ? configured : "./backups";
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function assertSafeFilename(filename: string): void {
  if (!BACKUP_FILE_RE.test(filename) || filename.includes("..") || filename.includes("/")) {
    throw new Error("Invalid backup filename");
  }
}

async function ensureBackupDir(): Promise<string> {
  const dir = getBackupDirectory();
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function runQuickCheck(dbPath: string): boolean {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
    return row?.quick_check === "ok";
  } finally {
    db.close();
  }
}

async function applyRetention(dir: string): Promise<number> {
  const maxRaw = getSetting("backup_max_count");
  const max = maxRaw ? parseInt(maxRaw, 10) : 25;
  const maxCount = Number.isFinite(max) && max > 0 ? Math.min(100, max) : 25;

  const files = (await fsp.readdir(dir)).filter((f) => BACKUP_FILE_RE.test(f)).sort();

  while (files.length > maxCount) {
    const oldest = files.shift();
    if (oldest) {
      await fsp.unlink(path.join(dir, oldest));
    }
  }
  return files.length;
}

export async function listBackups(): Promise<{ backups: BackupEntry[]; total: number }> {
  const dir = await ensureBackupDir();
  let names: string[] = [];
  try {
    names = (await fsp.readdir(dir)).filter((f) => BACKUP_FILE_RE.test(f));
  } catch {
    return { backups: [], total: 0 };
  }

  const backups: BackupEntry[] = [];
  for (const filename of names.sort().reverse()) {
    const stat = await fsp.stat(path.join(dir, filename));
    const match = filename.match(/^backup_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.sqlite$/);
    const created_at = match
      ? `${match[1]}T${match[2].replace(/-/g, ":")}:00.000Z`
      : stat.mtime.toISOString();
    backups.push({ filename, created_at, size_bytes: stat.size });
  }
  return { backups, total: backups.length };
}

export async function createBackup(options?: { source?: "user" | "system" }): Promise<{
  filename: string;
  size_bytes: number;
  backup_count: number;
}> {
  const dir = await ensureBackupDir();
  const filename = `backup_${utcTimestamp()}.sqlite`;
  const dest = path.join(dir, filename);

  const db = getDb();
  if (!runQuickCheckOnDb(db)) {
    throw new ApiRouteError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Database failed quick_check before backup",
      userMessage:
        "Database failed integrity check. Cannot create a reliable backup. Please contact support.",
      actions: [
        "Try again later.",
        "Go to Config → Backup & Restore to restore from a prior backup.",
      ],
      canRetry: false,
    });
  }
  db.pragma("wal_checkpoint(TRUNCATE)");
  await fsp.copyFile(getSqliteDatabasePath(), dest);

  const stat = await fsp.stat(dest);
  const backup_count = await applyRetention(dir);

  setSetting("last_backup_at", new Date().toISOString());

  logActivity({
    action: "backup.created",
    entityType: "backup",
    entityLabel: filename,
    detail: { size_bytes: stat.size, backup_count },
    source: options?.source ?? "user",
  });

  return { filename, size_bytes: stat.size, backup_count };
}

export async function deleteBackupFile(filename: string): Promise<void> {
  assertSafeFilename(filename);
  const filePath = path.join(getBackupDirectory(), filename);
  await fsp.unlink(filePath);
  logActivity({
    action: "backup.deleted",
    entityType: "backup",
    entityLabel: filename,
    source: "user",
  });
}

export async function restoreBackup(filename: string): Promise<{ pre_restore_backup: string }> {
  assertSafeFilename(filename);
  const dir = getBackupDirectory();
  const source = path.join(dir, filename);
  if (!fs.existsSync(source)) {
    throw new Error("Backup file not found");
  }
  if (!runQuickCheck(source)) {
    throw new Error("Backup file failed integrity check");
  }

  const pre = await createBackup();
  const dbPath = getSqliteDatabasePath();

  resetSqliteConnection();
  await fsp.copyFile(source, dbPath);
  getDb();

  logActivity({
    action: "backup.restored",
    entityType: "backup",
    entityLabel: filename,
    detail: { pre_restore_backup: pre.filename },
    source: "user",
  });

  return { pre_restore_backup: pre.filename };
}
