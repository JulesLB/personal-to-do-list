-- Urgency now comes from the deadline alone; drop the redundant flag.
ALTER TABLE "Item" DROP COLUMN "urgent";

-- Count active deferrals (snooze, or shoving the deadline later) so the board
-- and nudge can call out an item you keep pushing away.
ALTER TABLE "Item" ADD COLUMN "deferCount" INTEGER NOT NULL DEFAULT 0;

-- Type is derived from deadline/cadence; an undated, non-recurring item parks.
ALTER TABLE "Item" ALTER COLUMN "type" SET DEFAULT 'parking';
