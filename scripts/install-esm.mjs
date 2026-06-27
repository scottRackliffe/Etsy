import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { spawn, spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const args = new Set(process.argv.slice(2));
const nonInteractive = args.has("--non-interactive");
const skipInstall = args.has("--skip-install");
const skipStart = args.has("--skip-start");

function parseDotEnv(content) {
  const result = {};
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
    result[key] = value;
  }
  return result;
}

async function readEnvFile() {
  try {
    const content = await fs.readFile(envPath, "utf8");
    return parseDotEnv(content);
  } catch {
    return {};
  }
}

async function writeEnvFile(values) {
  const lines = [
    "# AiCE local environment",
    `ETSY_CLIENT_ID=${values.ETSY_CLIENT_ID ?? ""}`,
    `ETSY_CLIENT_SECRET=${values.ETSY_CLIENT_SECRET ?? ""}`,
    `ETSY_REDIRECT_URI=${values.ETSY_REDIRECT_URI ?? "http://localhost:3000/api/auth/etsy/callback"}`,
    "",
    "# Optional",
    values.ETSY_API_KEY_HEADER
      ? `ETSY_API_KEY_HEADER=${values.ETSY_API_KEY_HEADER}`
      : "# ETSY_API_KEY_HEADER=your_keystring:your_shared_secret",
    values.OPENAI_API_KEY ? `OPENAI_API_KEY=${values.OPENAI_API_KEY}` : "# OPENAI_API_KEY=",
    values.OPENAI_MODEL ? `OPENAI_MODEL=${values.OPENAI_MODEL}` : "# OPENAI_MODEL=gpt-4.1-mini",
    values.SQLITE_PATH ? `SQLITE_PATH=${values.SQLITE_PATH}` : "# SQLITE_PATH=./data/app.sqlite",
    "",
  ];
  await fs.writeFile(envPath, `${lines.join("\n")}\n`, "utf8");
}

function runStep(command, commandArgs, label) {
  output.write(`\n▶ ${label}\n`);
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function main() {
  output.write("\nInstall ESM\n");
  output.write("Scripted local installer.\n");

  const existing = await readEnvFile();
  const values = {
    ETSY_CLIENT_ID: process.env.ETSY_CLIENT_ID ?? existing.ETSY_CLIENT_ID ?? "",
    ETSY_CLIENT_SECRET: process.env.ETSY_CLIENT_SECRET ?? existing.ETSY_CLIENT_SECRET ?? "",
    ETSY_REDIRECT_URI: process.env.ETSY_REDIRECT_URI ?? existing.ETSY_REDIRECT_URI ?? "",
    ETSY_API_KEY_HEADER: process.env.ETSY_API_KEY_HEADER ?? existing.ETSY_API_KEY_HEADER ?? "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? existing.OPENAI_API_KEY ?? "",
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? existing.OPENAI_MODEL ?? "",
    SQLITE_PATH: process.env.SQLITE_PATH ?? existing.SQLITE_PATH ?? "",
  };

  if (!nonInteractive) {
    const rl = readline.createInterface({ input, output });
    const ask = async (label, fallback = "") => {
      const suffix = fallback ? ` [${fallback}]` : "";
      const value = (await rl.question(`${label}${suffix}: `)).trim();
      return value || fallback;
    };

    values.ETSY_CLIENT_ID = await ask("ETSY_CLIENT_ID", existing.ETSY_CLIENT_ID ?? "");
    values.ETSY_CLIENT_SECRET = await ask("ETSY_CLIENT_SECRET", existing.ETSY_CLIENT_SECRET ?? "");
    values.ETSY_REDIRECT_URI = await ask(
      "ETSY_REDIRECT_URI",
      existing.ETSY_REDIRECT_URI ?? "http://localhost:3000/api/auth/etsy/callback"
    );
    values.ETSY_API_KEY_HEADER = await ask(
      "ETSY_API_KEY_HEADER (optional)",
      existing.ETSY_API_KEY_HEADER ?? ""
    );
    values.OPENAI_API_KEY = await ask("OPENAI_API_KEY (optional)", existing.OPENAI_API_KEY ?? "");
    values.OPENAI_MODEL = await ask(
      "OPENAI_MODEL (optional)",
      existing.OPENAI_MODEL ?? "gpt-4.1-mini"
    );
    values.SQLITE_PATH = await ask("SQLITE_PATH (optional)", existing.SQLITE_PATH ?? "");
    rl.close();
  }

  if (!values.ETSY_CLIENT_ID || !values.ETSY_CLIENT_SECRET || !values.ETSY_REDIRECT_URI) {
    throw new Error(
      "Missing required values. Set ETSY_CLIENT_ID, ETSY_CLIENT_SECRET, and ETSY_REDIRECT_URI."
    );
  }

  await writeEnvFile(values);
  output.write(`\n✓ Wrote ${envPath}\n`);

  if (!skipInstall) {
    runStep(npmCmd, ["install"], "Install dependencies");
  }
  runStep(npmCmd, ["run", "env:check"], "Validate environment");
  runStep(npmCmd, ["run", "db:reset"], "Reset and seed database");

  if (skipStart) {
    output.write("\n✓ Initialization complete. Start app with: npm run ESM\n");
    return;
  }

  output.write("\nStarting app...\n\n");
  const child = spawn(npmCmd, ["run", "dev"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(`\nInstall ESM failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
