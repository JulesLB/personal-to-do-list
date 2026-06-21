-- Brute-force guard for the login routes. One row per attempt, keyed by client
-- IP + login kind; src/lib/ratelimit.ts counts recent failures in a window to
-- decide a lockout. DB-backed so the limit holds across serverless instances.

CREATE TABLE "LoginAttempt" (
  "id"        SERIAL       NOT NULL,
  "ip"        TEXT         NOT NULL,
  "kind"      TEXT         NOT NULL,
  "success"   BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginAttempt_ip_kind_createdAt_idx" ON "LoginAttempt"("ip", "kind", "createdAt");

-- Defense in depth: RLS on, matching the other tables. The app connects as the
-- table owner and bypasses RLS; every other role is default-deny.
ALTER TABLE "LoginAttempt" ENABLE ROW LEVEL SECURITY;
