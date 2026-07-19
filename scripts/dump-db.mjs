// Dumps every table to a single JSON file under backups/ (gitignored).
// Used when mothballing the project so the data survives a Supabase pause or
// deletion. Restore is a manual createMany per table; this is a safety copy,
// not a migration tool.
//
//   node --env-file=.env scripts/dump-db.mjs
//
// Needs the Supabase project to be ACTIVE. A paused project refuses connections
// and this exits with a connect error.
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";

const prisma = new PrismaClient();
const models = ["user", "referee", "item", "event", "setting", "feedback", "apiUsage", "loginAttempt"];

const out = {};
for (const m of models) {
  out[m] = await prisma[m].findMany();
  console.log(`${m}: ${out[m].length}`);
}

const stamp = new Date().toISOString().slice(0, 10);
mkdirSync("backups", { recursive: true });
const path = `backups/ember-db-${stamp}.json`;
writeFileSync(path, JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? String(v) : v), 2));
console.log(`\nwrote ${path}`);
await prisma.$disconnect();
