// Dry-run the Telegram intent router from the terminal, no Telegram needed.
// Usage: npm run try -- "push the dentist to friday"
//
// Ensures the local SQLite client exists, then runs the real classify.interpret
// against your local items using ANTHROPIC_API_KEY from .env. It only reads the
// DB and calls Claude; it changes nothing. CLIs run as `node <bin>` because
// Windows can't spawnSync a .cmd directly.

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = path.join(root, "prisma", "schema.sqlite.prisma");
const prismaBin = path.join(root, "node_modules", "prisma", "build", "index.js");
const env = { ...process.env, DATABASE_URL: "file:./dev.db" };
// Non-fatal: if dev:local is already running it may hold the DB / client files
// on Windows. That's fine — the client it generated is the one we want anyway.
const tryRun = (args) => {
  try {
    execFileSync(process.execPath, args, { stdio: "inherit", env, cwd: root });
  } catch {
    console.warn("(using the existing local Prisma client)");
  }
};

// Idempotent: creates prisma/dev.db if missing and points the client at SQLite.
tryRun([prismaBin, "db", "push", "--schema", schema, "--skip-generate"]);
tryRun([prismaBin, "generate", "--schema", schema]);

const runner = path.join(root, "scripts", "try-run.ts");
const r = spawnSync(
  process.execPath,
  ["--env-file=.env", "--import", "tsx", runner, ...process.argv.slice(2)],
  { stdio: "inherit", env, cwd: root }
);
process.exit(r.status ?? 0);
