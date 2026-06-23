-- M8 timed nudges: a precise instant to ping (dueAt), on top of the 09:00
-- day-anchor deadline, plus an idempotency stamp (dueNudgedAt) so the timed ping
-- fires at most once. Additive and nullable, so deploying this against the live
-- table is safe and needs no backfill.
ALTER TABLE "Item" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "dueNudgedAt" TIMESTAMP(3);
