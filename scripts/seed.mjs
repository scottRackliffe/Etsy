import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.SQLITE_PATH?.trim() || path.join(process.cwd(), "data", "app.sqlite");
const seedSqlPath = path.join(process.cwd(), "fixtures", "seed-data.sql");

if (!fs.existsSync(dbPath)) {
  throw new Error(`Database not found at ${dbPath}. Run npm run db:migrate first.`);
}
if (!fs.existsSync(seedSqlPath)) {
  throw new Error(`Seed SQL not found at ${seedSqlPath}.`);
}

const db = new Database(dbPath);
const sql = fs.readFileSync(seedSqlPath, "utf8");
db.exec(sql);
db.close();

console.log(`Seed data applied from ${seedSqlPath}`);
