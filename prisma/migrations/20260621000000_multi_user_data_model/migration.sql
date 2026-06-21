-- PRD-10: multi-user data model. Introduce User + Referee, give every Item an
-- owner, and backfill the existing single user (Jules) as user 1 so nothing is
-- orphaned. Item.userId is added nullable, backfilled, then enforced NOT NULL.

-- 1. User: the Telegram chat is the identity anchor.
CREATE TABLE "User" (
  "id"             SERIAL       NOT NULL,
  "telegramChatId" TEXT         NOT NULL,
  "name"           TEXT,
  "email"          TEXT,
  "timezone"       TEXT         NOT NULL DEFAULT 'Asia/Hong_Kong',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- 2. Referee: per-user, replacing the WIFE_WHATSAPP / *_CONSENT env trio.
CREATE TABLE "Referee" (
  "id"        SERIAL       NOT NULL,
  "userId"    INTEGER      NOT NULL,
  "label"     TEXT         NOT NULL,
  "relation"  TEXT,
  "channel"   TEXT         DEFAULT 'whatsapp',
  "contact"   TEXT,
  "consent"   BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Referee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Referee_userId_label_key" ON "Referee"("userId", "label");
CREATE INDEX "Referee_userId_idx" ON "Referee"("userId");

-- 3. Backfill the owner. Use ownerChatId from Setting if present (it is, in prod);
-- otherwise a placeholder the bot will reconcile on first contact (TOFU still holds).
INSERT INTO "User" ("telegramChatId", "name")
SELECT COALESCE((SELECT "value" FROM "Setting" WHERE "key" = 'ownerChatId'), 'pending-owner'), 'Jules';

-- 4. Item.userId: add nullable, backfill to the owner (lowest user id), enforce NOT NULL.
ALTER TABLE "Item" ADD COLUMN "userId" INTEGER;
UPDATE "Item"
  SET "userId" = (SELECT "id" FROM "User" ORDER BY "id" ASC LIMIT 1)
  WHERE "userId" IS NULL;
ALTER TABLE "Item" ALTER COLUMN "userId" SET NOT NULL;
CREATE INDEX "Item_userId_idx" ON "Item"("userId");

-- 5. Seed the owner's referees from the labels already used on their items. The
-- contact (phone) stays NULL here; it lives in env during the M2 transition and
-- referee.ts falls back to the env value by label until the row carries one.
INSERT INTO "Referee" ("userId", "label")
SELECT (SELECT "id" FROM "User" ORDER BY "id" ASC LIMIT 1), t."referee"
FROM (SELECT DISTINCT "referee" FROM "Item" WHERE "referee" IS NOT NULL) t;

-- 6. Foreign keys.
ALTER TABLE "Item"
  ADD CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referee"
  ADD CONSTRAINT "Referee_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Defense in depth: RLS on the new tables, matching the existing pattern. The
-- app connects as the table owner and bypasses RLS; every other role is default-deny.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Referee" ENABLE ROW LEVEL SECURITY;
