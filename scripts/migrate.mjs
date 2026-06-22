/**
 * scripts/migrate.mjs — idempotent SQLite migration runner.
 *
 * Works safely against any DB state:
 *   • fresh DB (no tables yet)         → applies every migration cleanly
 *   • bootstrap-managed DB (sqlite.ts) → back-fills schema_migrations, skips
 *                                        statements that already exist
 *   • partially-migrated DB            → resumes from the first unrecorded file
 *   • fully-migrated DB                → clean no-op
 *
 * Per-statement idempotency (WS-MIGRATE):
 *   Each migration file is split into individual statements (on `;`).
 *   An "already exists" class error (duplicate column name, table/index already
 *   exists) is swallowed and the statement is skipped.  Any other error aborts
 *   the run immediately (non-zero exit) and rolls back the current migration's
 *   transaction so no partial schema_migrations row is written.
 *
 * --reset  drops and recreates the DB file, then runs all migrations fresh.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath =
  process.env.SQLITE_PATH?.trim() ||
  path.join(process.cwd(), "data", "app.sqlite");
const migrationsDir = path.join(process.cwd(), "migrations");
const reset = process.argv.includes("--reset");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// --reset: wipe the DB file so everything is applied fresh.
if (reset) {
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath);
    console.log("Reset: removed existing database file.");
  }
}

const db = new Database(dbPath);

// Ensure the tracking table exists (safe for both fresh and existing DBs).
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Split an SQL string into individual executable statements.
 * Strips single-line (--) comments FIRST so that any semicolon appearing
 * inside a comment (e.g. "-- foo; bar") is not mistaken for a statement
 * terminator.  Then splits on `;` and drops empty fragments.
 * Safe for our migration files (simple DDL, no block comments, no
 * trigger/procedure BEGIN…END blocks with embedded semicolons).
 */
function splitStatements(sql) {
  // Remove single-line comments before splitting on ';'.
  const stripped = sql.replace(/--[^\n]*/g, "");
  return stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Returns true when the error is an idempotency no-op:
 *   • "duplicate column name" / "already exists" — DDL that was already applied
 *     by a prior run or by the sqlite.ts bootstrap (ADD COLUMN, CREATE TABLE/INDEX).
 *   • "no such table" — a backfill INSERT/UPDATE/SELECT targeting a table that
 *     exists only in the sqlite.ts bootstrap (e.g. `receipts` in migration 010).
 *     On a fresh --reset DB the table doesn't exist yet; sqlite.ts creates it with
 *     all current columns on first app start, so skipping the backfill is safe.
 */
function isAlreadyExistsError(err) {
  return /duplicate column name|already exists|no such table/i.test(
    err?.message ?? ""
  );
}

// ─── main loop ──────────────────────────────────────────────────────────────

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

for (const file of migrationFiles) {
  // Fast-path: already recorded → skip entirely.
  const alreadyApplied = db
    .prepare("SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1")
    .get(file);
  if (alreadyApplied) continue;

  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  const statements = splitStatements(sql);

  // allReconciled: true when every statement was an already-exists no-op
  // (bootstrap-managed DB case — nothing was actually executed).
  let allReconciled = true;

  const tx = db.transaction(() => {
    for (const stmt of statements) {
      try {
        db.exec(stmt);
        allReconciled = false; // at least one statement ran for real
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          // Column / table / index already present — treat as no-op and continue.
        } else {
          // Real error: rethrow so the transaction rolls back and the run aborts.
          throw err;
        }
      }
    }
    // Record the migration whether it was applied fresh or fully reconciled,
    // so subsequent runs skip it via the fast-path above.
    // Use INSERT OR REPLACE because some migration files contain their own
    // "INSERT OR IGNORE INTO schema_migrations(version) VALUES (...)" statements
    // (with the sqlite.ts DEFAULT applied_at) — OR REPLACE overwrites that row
    // with our ISO timestamp and ensures a clean recorded state.
    db.prepare(
      "INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES(?, ?)"
    ).run(file, new Date().toISOString());
  });

  try {
    tx();
    const label = allReconciled
      ? "reconciled (already present)"
      : "applied";
    console.log(`Migration ${label}: ${file}`);
  } catch (err) {
    console.error(`Migration FAILED: ${file}`);
    console.error(err.message);
    process.exit(1);
  }
}

console.log(`Database ready at ${dbPath}`);
db.close();
