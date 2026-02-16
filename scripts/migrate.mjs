import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.SQLITE_PATH?.trim() || path.join(process.cwd(), "data", "app.sqlite");
const migrationsDir = path.join(process.cwd(), "migrations");
const reset = process.argv.includes("--reset");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

if (reset) {
  // Reset strategy for local development: recreate the SQLite file.
  db.close();
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db2 = reset ? new Database(dbPath) : db;
db2.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

for (const file of migrationFiles) {
  const alreadyApplied = db2
    .prepare("SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1")
    .get(file);

  if (alreadyApplied) {
    continue;
  }

  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  const tx = db2.transaction(() => {
    db2.exec(sql);
    db2
      .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)")
      .run(file, new Date().toISOString());
  });
  tx();
  console.log(`Applied migration: ${file}`);
}

console.log(`Database ready at ${dbPath}`);
db2.close();
