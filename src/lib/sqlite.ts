import fs from "node:fs";
import path from "node:path";
import { purgeOldActivityLog } from "@/lib/activity-log";
import { logger } from "@/lib/logging";
import { runStartupIntegrityCheckIfDue } from "@/lib/sqlite-integrity";
import { applyMigrations } from "@/lib/db-migrate";
import Database from "better-sqlite3";

/**
 * better-sqlite3 uses a single synchronous connection (not thread-safe across instances).
 * The singleton below is the correct pattern for Next.js API routes in this app.
 */
let dbInstance: Database.Database | null = null;
let schemaReady = false;

export function getSqliteDatabasePath(): string {
  return getDatabasePath();
}

function getDatabasePath(): string {
  const configuredPath = process.env.SQLITE_PATH?.trim();
  return configuredPath && configuredPath.length > 0
    ? configuredPath
    : path.join(process.cwd(), "data", "app.sqlite");
}

function configureDatabasePragmas(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  dbInstance = new Database(databasePath);
  configureDatabasePragmas(dbInstance);

  if (!schemaReady) {
    // ADR-087 / WS-CR2: bring the DB to current by applying migrations — the
    // single source of truth. No parallel CREATE TABLE bootstrap.
    applyMigrations(dbInstance);
    schemaReady = true;
    purgeOldActivityLog();
    runStartupIntegrityCheckIfDue(dbInstance);
  }

  return dbInstance;
}

export function resetSqliteConnection(): void {
  if (dbInstance) {
    try {
      dbInstance.pragma("wal_checkpoint(TRUNCATE)");
      dbInstance.close();
    } catch (error) {
      logger.warn("sqlite close during reset failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    dbInstance = null;
    schemaReady = false;
  }
}
