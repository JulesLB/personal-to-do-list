-- Launch-prereq feedback channel: the bot's `/feedback <msg>` writes one row per
-- submission; the weekly Sunday digest reads them. Additive only (a new table no
-- existing code reads), so it is safe to apply ahead of the matching code.

CREATE TABLE "Feedback" (
  "id"        SERIAL       NOT NULL,
  "userId"    INTEGER      NOT NULL,
  "message"   TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense in depth: match the RLS pattern on the other tables. The app connects
-- as the table owner and bypasses RLS; every other role is default-deny.
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
