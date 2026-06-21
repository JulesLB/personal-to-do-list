-- Ops cost/telemetry log: one row per paid external call (Anthropic classify +
-- coach, OpenAI Whisper). Raw tokens are the source of truth; costUsd is a
-- write-time snapshot so a later price change can't rewrite history. userId is
-- SET NULL on user delete so spend history survives an account deletion.

CREATE TABLE "ApiUsage" (
  "id"                SERIAL           NOT NULL,
  "createdAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source"            TEXT             NOT NULL,
  "provider"          TEXT             NOT NULL,
  "model"             TEXT             NOT NULL,
  "userId"            INTEGER,
  "inputTokens"       INTEGER          NOT NULL DEFAULT 0,
  "outputTokens"      INTEGER          NOT NULL DEFAULT 0,
  "cacheReadTokens"   INTEGER          NOT NULL DEFAULT 0,
  "cacheCreateTokens" INTEGER          NOT NULL DEFAULT 0,
  "audioSeconds"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costUsd"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "latencyMs"         INTEGER,
  "ok"                BOOLEAN          NOT NULL DEFAULT true,
  "errorKind"         TEXT,
  CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApiUsage_createdAt_idx" ON "ApiUsage"("createdAt");
CREATE INDEX "ApiUsage_userId_idx" ON "ApiUsage"("userId");
CREATE INDEX "ApiUsage_source_idx" ON "ApiUsage"("source");

ALTER TABLE "ApiUsage"
  ADD CONSTRAINT "ApiUsage_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense in depth: match the RLS pattern on the other tables. The app connects
-- as the table owner and bypasses RLS; every other role is default-deny.
ALTER TABLE "ApiUsage" ENABLE ROW LEVEL SECURITY;
