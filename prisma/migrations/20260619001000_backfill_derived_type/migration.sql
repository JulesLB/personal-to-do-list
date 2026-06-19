-- Re-derive type for existing rows so stored data obeys the new rule:
-- a cadence means commitment, a one-off date means task, neither means parking.
UPDATE "Item" SET "type" = 'commitment' WHERE "cadence" IS NOT NULL;
UPDATE "Item" SET "type" = 'task'       WHERE "cadence" IS NULL AND "deadline" IS NOT NULL;
UPDATE "Item" SET "type" = 'parking'    WHERE "cadence" IS NULL AND "deadline" IS NULL;
