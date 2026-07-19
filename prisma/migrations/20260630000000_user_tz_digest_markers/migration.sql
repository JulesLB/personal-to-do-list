-- PRD-18 per-user timezones: the daily digests now fire at 08:00/20:00 in each
-- user's own timezone, driven by a 5-min tick that evaluates every user. These
-- two columns record the local date (YYYY-MM-DD) each digest last fired so the
-- tick sends morning/evening exactly once per local day. Additive and nullable,
-- so deploying against the live table is safe and needs no backfill.
ALTER TABLE "User" ADD COLUMN "lastMorningNudgeOn" TEXT;
ALTER TABLE "User" ADD COLUMN "lastEveningNudgeOn" TEXT;
