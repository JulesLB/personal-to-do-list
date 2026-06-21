// One-command local board: spins up an isolated SQLite DB, seeds sample items,
// generates the matching Prisma client, and starts Next.js — all without
// touching prod Supabase or the tracked Postgres schema. Ctrl+C to stop.
//
// DATABASE_URL is injected into every child process here, so nothing relies on
// shell env syntax (which differs between PowerShell and bash) and .env is never
// edited. Next and Prisma both honor an already-set env var over the .env file.
// CLIs are run as `node <bin>` because Windows can't spawnSync a .cmd directly.

import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = path.join(root, "prisma", "schema.sqlite.prisma");
const prismaBin = path.join(root, "node_modules", "prisma", "build", "index.js");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

// --empty seeds a brand-new user with no items so the board shows its first-run
// onboarding screen instead of the sample list.
const empty = process.argv.includes("--empty");

// Relative file: URL resolves against the schema dir (prisma/), so the DB lands
// at prisma/dev.db for both the CLI and the running app.
const env = { ...process.env, DATABASE_URL: "file:./dev.db", ...(empty ? { SEED_EMPTY: "1" } : {}) };
const run = (args) => execFileSync(process.execPath, args, { stdio: "inherit", env, cwd: root });

console.log("→ Creating / resetting local SQLite DB (prisma/dev.db)");
// --force-reset drops and recreates the DB so schema changes that can't migrate in
// place (e.g. a new required column like userId) always apply. The sandbox is
// reseeded below every run, so there's no data worth keeping.
run([prismaBin, "db", "push", "--schema", schema, "--force-reset", "--accept-data-loss"]);

console.log(empty ? "→ Seeding an empty new user (board first-run)" : "→ Seeding sample items (this resets the local DB each run)");
run([path.join(root, "prisma", "seed.mjs")]);

console.log("\n→ Board: http://localhost:3000  (log in with your APP_SECRET)\n");
const dev = spawn(process.execPath, [nextBin, "dev"], { stdio: "inherit", env, cwd: root });
dev.on("exit", (code) => process.exit(code ?? 0));
