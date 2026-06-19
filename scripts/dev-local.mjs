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

// Relative file: URL resolves against the schema dir (prisma/), so the DB lands
// at prisma/dev.db for both the CLI and the running app.
const env = { ...process.env, DATABASE_URL: "file:./dev.db" };
const run = (args) => execFileSync(process.execPath, args, { stdio: "inherit", env, cwd: root });

console.log("→ Creating / updating local SQLite DB (prisma/dev.db)");
run([prismaBin, "db", "push", "--schema", schema, "--accept-data-loss"]);

console.log("→ Seeding sample items (this resets the local DB each run)");
run([path.join(root, "prisma", "seed.mjs")]);

console.log("\n→ Board: http://localhost:3000  (log in with your APP_SECRET)\n");
const dev = spawn(process.execPath, [nextBin, "dev"], { stdio: "inherit", env, cwd: root });
dev.on("exit", (code) => process.exit(code ?? 0));
