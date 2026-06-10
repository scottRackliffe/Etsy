import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";
import { ApiRouteError } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getSetting, setSetting } from "@/lib/settings-store";
import { runQuickCheckOnDb, runIntegrityCheckOnDb } from "@/lib/sqlite-integrity";
import { getSqliteDatabasePath, getDb, resetSqliteConnection } from "@/lib/sqlite";
import { logger } from "@/lib/logging";

const BACKUP_ARCHIVE_RE = /^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.tar\.gz$/;
const BACKUP_FILE_RE = /^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.(sqlite|tar\.gz)$/;
const PRE_RESTORE_RE = /^pre_restore_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sqlite$/;

const LOCK_RETRY_DELAY_MS = 2_000;
const LOCK_RETRY_MAX = 3;

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
  const isValid =
    BACKUP_FILE_RE.test(filename) || PRE_RESTORE_RE.test(filename);
  if (!isValid || filename.includes("..") || filename.includes("/")) {
    throw new Error("Invalid backup filename");
  }
}

async function ensureBackupDir(): Promise<string> {
  const dir = getBackupDirectory();
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function runFullIntegrityCheck(dbPath: string): boolean {
  const db = new Database(dbPath, { readonly: true });
  try {
    const { ok } = runIntegrityCheckOnDb(db);
    return ok;
  } finally {
    db.close();
  }
}

async function applyRetention(dir: string): Promise<number> {
  const maxRaw = getSetting("backup_max_count");
  const max = maxRaw ? parseInt(maxRaw, 10) : 25;
  const maxCount = Number.isFinite(max) && max > 0 ? Math.min(100, max) : 25;

  const files = (await fsp.readdir(dir))
    .filter((f) => BACKUP_FILE_RE.test(f))
    .sort();

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
    const allFiles = await fsp.readdir(dir);
    names = allFiles.filter((f) => BACKUP_FILE_RE.test(f) || PRE_RESTORE_RE.test(f));
  } catch {
    return { backups: [], total: 0 };
  }

  const backups: BackupEntry[] = [];
  for (const filename of names.sort().reverse()) {
    const stat = await fsp.stat(path.join(dir, filename));
    const match = filename.match(
      /^(?:backup|pre_restore)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.(sqlite|tar\.gz)$/
    );
    const created_at = match
      ? `${match[1]}T${match[2].replace(/-/g, ":")}:00.000Z`
      : stat.mtime.toISOString();
    backups.push({ filename, created_at, size_bytes: stat.size });
  }
  return { backups, total: backups.length };
}

export async function createBackup(options?: {
  source?: "user" | "system";
  namePrefix?: string;
}): Promise<{
  filename: string;
  size_bytes: number;
  backup_count: number;
}> {
  const dir = await ensureBackupDir();
  const prefix = options?.namePrefix ?? "backup";
  const ts = utcTimestamp();
  const includePictures = getSetting("backup_include_pictures") === "true";
  const sqliteFilename = `${prefix}_${ts}.sqlite`;
  const sqliteDest = path.join(dir, sqliteFilename);

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

  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("locked") && attempt < LOCK_RETRY_MAX - 1) {
        logger.warn("backup.wal_checkpoint_locked", { attempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, LOCK_RETRY_DELAY_MS));
        continue;
      }
      throw new ApiRouteError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: "Database is locked and cannot be backed up",
        userMessage:
          "The database is currently locked by another operation. Please try again in a moment.",
        actions: ["Wait a few seconds and retry."],
        canRetry: true,
      });
    }
  }

  await fsp.copyFile(getSqliteDatabasePath(), sqliteDest);

  let finalFilename = sqliteFilename;
  let finalPath = sqliteDest;

  if (includePictures && prefix === "backup") {
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (fs.existsSync(uploadsDir)) {
      const archiveFilename = `${prefix}_${ts}.tar.gz`;
      const archivePath = path.join(dir, archiveFilename);
      try {
        execSync(
          `tar -czf ${JSON.stringify(archivePath)} -C ${JSON.stringify(dir)} ${JSON.stringify(sqliteFilename)} -C ${JSON.stringify(process.cwd())} uploads`,
          { timeout: 120_000 }
        );
        await fsp.unlink(sqliteDest);
        finalFilename = archiveFilename;
        finalPath = archivePath;
      } catch (err) {
        logger.warn("backup.archive_failed_falling_back_to_sqlite", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const stat = await fsp.stat(finalPath);
  const isPreRestore = prefix === "pre_restore";
  const backup_count = isPreRestore
    ? (await fsp.readdir(dir)).filter((f) => BACKUP_FILE_RE.test(f)).length
    : await applyRetention(dir);

  setSetting("last_backup_at", new Date().toISOString());

  logActivity({
    action: isPreRestore ? "backup.pre_restore_created" : "backup.created",
    entityType: "backup",
    entityLabel: finalFilename,
    detail: { size_bytes: stat.size, backup_count },
    source: options?.source ?? "user",
  });

  return { filename: finalFilename, size_bytes: stat.size, backup_count };
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
  const sourcePath = path.join(dir, filename);
  if (!fs.existsSync(sourcePath)) {
    throw new Error("Backup file not found");
  }

  const isArchive = BACKUP_ARCHIVE_RE.test(filename);
  let sqliteSource = sourcePath;

  if (isArchive) {
    const tmpDir = path.join(dir, `_restore_tmp_${Date.now()}`);
    try {
      await fsp.mkdir(tmpDir, { recursive: true });
      execSync(`tar -xzf ${JSON.stringify(sourcePath)} -C ${JSON.stringify(tmpDir)}`, {
        timeout: 120_000,
      });
      const sqliteFiles = (await fsp.readdir(tmpDir)).filter((f) => f.endsWith(".sqlite"));
      if (sqliteFiles.length === 0) {
        throw new Error("Archive does not contain a SQLite database file");
      }
      sqliteSource = path.join(tmpDir, sqliteFiles[0]);
    } catch (err) {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      if (err instanceof Error && err.message.includes("does not contain")) throw err;
      throw new Error("Failed to extract backup archive");
    }
  }

  if (!runFullIntegrityCheck(sqliteSource)) {
    if (isArchive) {
      await fsp.rm(path.dirname(sqliteSource), { recursive: true, force: true }).catch(() => {});
    }
    throw new Error("Backup file failed integrity check");
  }

  const pre = await createBackup({ source: "system", namePrefix: "pre_restore" });
  const dbPath = getSqliteDatabasePath();

  resetSqliteConnection();
  await fsp.copyFile(sqliteSource, dbPath);

  if (isArchive) {
    const tmpDir = path.dirname(sqliteSource);
    const uploadsInArchive = path.join(tmpDir, "uploads");
    if (fs.existsSync(uploadsInArchive)) {
      const targetUploads = path.join(process.cwd(), "uploads");
      await fsp.cp(uploadsInArchive, targetUploads, { recursive: true, force: true });
    }
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

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
