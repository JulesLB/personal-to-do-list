// Set up an isolated, throwaway SQLite DB and run the multi-user isolation checks
// against real Prisma (no Postgres, no prod). Mirrors try.mjs: the DB file is
// recreated fresh each run, and the sqlite client is generated so src/lib code can
// talk to it. CLIs run as `node <bin>` because Windows can't spawnSync a .cmd.
//
//   npm run check:isolation
//
// Note: this regenerates the Prisma client for SQLite. Run `npm run build` (or
// `npx prisma generate`) afterward to restore the Postgres client for app work.

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = path.join(root, "prisma", "schema.sqlite.prisma");
const prismaBin = path.join(root, "node_modules", "prisma", "build", "index.js");
// Relative file: URL resolves against the schema dir (prisma/).
const env = { ...process.env, DATABASE_URL: "file:./isolation-test.db" };
const run = (args) => execFileSync(process.execPath, args, { stdio: "inherit", env, cwd: root });

// Start from a clean DB so `db push` just creates it — no destructive reset needed.
fs.rmSync(path.join(root, "prisma", "isolation-test.db"), { force: true });
run([prismaBin, "db", "push", "--schema", schema, "--skip-generate"]);
run([prismaBin, "generate", "--schema", schema]);

const runner = path.join(root, "scripts", "check-isolation.ts");
const r = spawnSync(process.execPath, ["--env-file=.env", "--import", "tsx", runner], {
  stdio: "inherit",
  env,
  cwd: root,
});
process.exit(r.status ?? 0);
