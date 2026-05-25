import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const required = ["ETSY_CLIENT_ID", "ETSY_CLIENT_SECRET", "ETSY_REDIRECT_URI"];
const optional = [
  "ETSY_API_KEY_HEADER",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "SQLITE_PATH",
  "NODE_ENV",
  "PORT",
];

const missing = required.filter(
  (key) => !process.env[key] || String(process.env[key]).trim().length === 0
);

if (missing.length > 0) {
  console.error("Missing required environment variables:");
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  console.error("See documents/setup/ENV_MATRIX.md for required values.");
  process.exit(1);
}

console.log("Environment check passed.");
console.log("Required variables present:");
for (const key of required) {
  console.log(`- ${key}`);
}

console.log("Optional variables detected:");
for (const key of optional) {
  if (process.env[key]) {
    console.log(`- ${key}`);
  }
}
