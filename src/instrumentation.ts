// Boot-time env validation (Next's instrumentation hook runs register() once when
// a server runtime starts). The point is to fail fast on a misconfigured deploy
// instead of silently running with undefined secrets and falling into insecure
// defaults. Security-critical secrets throw; operational ones only warn so a
// missing optional feature doesn't brick the whole app.

// Secrets whose absence is a security hole or breaks auth entirely. Missing any
// of these in production aborts startup.
const REQUIRED = [
  "APP_SECRET", // board sessions, login links, referee tokens
  "ADMIN_SECRET", // ops console
  "CRON_SECRET", // cron auth
  "TELEGRAM_WEBHOOK_SECRET", // webhook auth
  "DATABASE_URL", // db
];

// Needed for features to work, but their absence is breakage, not a security hole.
const RECOMMENDED = ["ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "APP_URL"];

export async function register() {
  // Only enforce in production; local/dev may legitimately run a subset.
  if (process.env.NODE_ENV !== "production") return;

  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required env var(s): ${missing.join(", ")}. Refusing to start with insecure defaults.`
    );
  }

  const soft = RECOMMENDED.filter((k) => !process.env[k]);
  if (soft.length) {
    console.warn(`[env] missing recommended var(s): ${soft.join(", ")} — related features will be degraded.`);
  }
}
