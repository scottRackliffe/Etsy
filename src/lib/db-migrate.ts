/**
 * Runtime SQLite migration applier (ADR-087 — migrations are the single source
 * of truth; the app *applies* migrations and maintains no second schema).
 *
 * This is the runtime counterpart of `scripts/migrate.mjs` (the CLI used by
 * `npm run db:migrate`). Both implement the SAME idempotent algorithm; keep them
 * in sync if the algorithm changes. Schema *definition* lives only in
 * `migrations/` — there is no parallel `CREATE TABLE` path (the former
 * `ensureCoreTables`/`ensureInventorySchema` bootstrap was retired in WS-CR2).
 *
 * Idempotency (WS-MIGRATE): each migration file is split into statements; an
 * "already exists"/"no such table" class error is swallowed (the statement was
 * already applied by a prior run), and the version is recorded so subsequent
 * boots fast-path past it. Any other error aborts and rolls back that migration's
 * transaction, so no partial `schema_migrations` row is written.
 */
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { logger } from "@/lib/logging";

function migrationsDir(): string {
  return path.join(process.cwd(), "migrations");
}

/** Split SQL into executable statements; strip line comments first so a `;`
 * inside a comment isn't treated as a terminator. */
function splitStatements(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Idempotency no-op classes: DDL already applied (duplicate column / already
 * exists) or a backfill targeting a table that doesn't exist on this DB yet. */
function isAlreadyExistsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /duplicate column name|already exists|no such table/i.test(msg);
}

/**
 * Apply all pending migrations to `db` (the app's existing connection). Safe on
 * a fresh DB (applies everything), a partially-migrated DB (resumes), and a
 * fully-migrated DB (no-op). Throws on a genuine migration error.
 */
export function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const dir = migrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const isApplied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1");
  const record = db.prepare(
    "INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES(?, ?)"
  );

  let appliedCount = 0;
  for (const file of files) {
    if (isApplied.get(file)) continue;

    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const statements = splitStatements(sql);

    const tx = db.transaction(() => {
      for (const stmt of statements) {
        try {
          db.exec(stmt);
        } catch (err) {
          if (!isAlreadyExistsError(err)) throw err;
          // already-present / not-applicable here → idempotent no-op
        }
      }
      record.run(file, new Date().toISOString());
    });

    try {
      tx();
      appliedCount += 1;
    } catch (err) {
      logger.error("migration failed", {
        file,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  if (appliedCount > 0) {
    logger.info("migrations applied at startup", { count: appliedCount });
  }
}
