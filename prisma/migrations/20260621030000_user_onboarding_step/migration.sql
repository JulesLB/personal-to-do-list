-- M5 first-run activation: track where a user is in onboarding.
-- Default 'done' backfills existing users past the flow; resolveUser stamps
-- 'new' on genuinely fresh chats so only they see the guided first run.
ALTER TABLE "User" ADD COLUMN "onboardingStep" TEXT NOT NULL DEFAULT 'done';
