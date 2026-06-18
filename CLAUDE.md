# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hermes — a single-user accountability engine. You text a Telegram bot what you commit to;
Claude classifies it into a structured item; a pressure score ranks everything; two daily Vercel
crons (a morning nudge and an evening honesty check) push the most pressing task; ignoring it long
enough surfaces a pre-drafted WhatsApp message to a "referee" (wife/sister/colleague). A
password-gated web board shows the same ranked list. The bet: capture was never the problem,
follow-through was — so the code invests in ranking, nagging, and escalation, not storage.

All day/deadline math runs in **HKT (UTC+8, fixed offset, no DST)** so "due today" never drifts on
the UTC server. The single user is based in Hong Kong.

## Commands

```bash
npm run dev             # Next.js dev server on :3000
npm run build           # prisma generate && next build (type-check gate)
npm run db:migrate       # prisma migrate dev — create + apply a migration after editing the schema
npm run db:migrate:deploy # prisma migrate deploy — apply pending migrations (what Vercel runs)
npm run db:seed         # load sample items (node --env-file=.env prisma/seed.mjs)
npm run db:studio       # Prisma Studio
npm run set-webhook     # point the Telegram bot at APP_URL/api/telegram
npx tsx scripts/preview-nudge.ts [evening]   # print the morning (or evening) nudge without sending
```

`npm test` (Vitest) covers the pure logic in `rank.ts` and `nudge.ts`; tests live in `tests/` and
run against a fixed clock, no DB. There is no linter. `npm run build` (which runs `prisma generate`)
is the type-check / sanity gate. Run both before committing.

## Database migrations

The schema is versioned with **Prisma Migrate**; migration files live in
[prisma/migrations/](prisma/migrations/) and are committed to git. The flow: edit
[prisma/schema.prisma](prisma/schema.prisma), run `npm run db:migrate` to create and apply a
migration locally, commit the generated SQL. On deploy, Vercel runs `vercel-build`
(`prisma migrate deploy && prisma generate && next build`), so pending migrations apply
automatically against the prod DB — no manual `db push` step. `DIRECT_URL` (session pooler, 5432)
must be set in Vercel for migrations to run.

`db push` is retained only for the fully-offline SQLite path: switch `provider` in the schema to
`sqlite`, set `DATABASE_URL="file:./dev.db"`, run `npm run db:push`, and switch both back before
committing. Don't mix `db push` and migrate against the same Postgres DB.

## Architecture

The data model is deliberately one flat table. Everything else is functions over it.

**`Item`** ([prisma/schema.prisma](prisma/schema.prisma)) — the main entity. Key fields:
`type` (`task` | `commitment` | `parking`), `important`/`urgent` booleans, `deadline`, `referee`,
`category` (six fixed values), `cadence` (commitments only), `status` (`open` | `done` | `retired`),
`snoozeUntil`, `lastNudgedAt`, `promisedAt` (set when you tap "I'll do it today"; the evening check
reads it to call out broken promises). Commitments also use `lastDoneAt` (when the current cycle was
last honored — this, not `lastNudgedAt`, drives cadence-overdue math so nudging never resets the
clock) and `cycleStreak`. Accountability memory lives in `nudgeCount` / `ignoreCount` (bumped in the
sweep) plus an append-only **`Event`** table (`itemId`, `kind` = `nudged|snoozed|promised|done|...`,
`slot`) that Phase 2 escalation and Phase 3 analytics read. **`Setting`** is a key/value table whose
only live key is `ownerChatId` — the single user's Telegram chat, auto-learned from their first
message so the cron knows where to nudge.

Completing a **commitment** does not close it: it sets `lastDoneAt = now`, clears `lastNudgedAt` /
`promisedAt`, bumps `cycleStreak`, and leaves `status = open` so it resurfaces one cadence later.
`retire` is the explicit "end it for good" path (`status = retired`). Tasks still close on done.

**Ranking is the core IP** ([src/lib/rank.ts](src/lib/rank.ts)). `rankScore` collapses
importance + urgency + deadline proximity + (for commitments) cadence-overdue into one number.
`heatOf` buckets an item into `burning` / `soon` / `later` for display (commitments go `burning`
once they're a full cadence cycle overdue). `daysOverdue` and `isCritical` drive escalation;
`promisedToday` flags a broken same-day promise. All day boundaries use `startOfDayHKT`. Parking
items score `-1` and are excluded from the actionable list. There are no quadrants — the score
decides order. The board and both nudge slots consume `rankActionable`.

**Classification** ([src/lib/classify.ts](src/lib/classify.ts)) — one Claude call with a forced
`save_item` tool to turn a messy sentence into a `Classified` object. The system prompt encodes
Jules-specific rules (which referee for what, the six categories, the important-but-not-urgent
"death zone"). The model is pinned in [src/lib/anthropic.ts](src/lib/anthropic.ts): Haiku is the
only model called anywhere in the app.

**Telegram webhook** ([src/app/api/telegram/route.ts](src/app/api/telegram/route.ts)) — the main
input surface. Handles inline button callbacks (`done:`/`today:`/`snooze:<id>`) and typed commands
(`list`, `done <id>`, `snooze <id> <days>`, `due <id> YYYY-MM-DD`, `retire <id>`) via regex; anything
else falls through to `classify` and gets stored. `done` routes through `completeItem` (commitment-
aware, see above) and logs a `done` Event; `today:` sets `promisedAt` (deliberately *not* a snooze,
so the evening sweep can catch it still open) and logs `promised`. Deadlines are stored at `09:00
HKT` (`T09:00:00+08:00`).
Auth is the `x-telegram-bot-api-secret-token` header vs `TELEGRAM_WEBHOOK_SECRET`. Always returns
200 (even on internal error) so Telegram doesn't retry.

**Nudge engine** — `buildDailyNudge(items, now, slot)` in [src/lib/nudge.ts](src/lib/nudge.ts) is
pure (items → text + keyboard + topId) and imports no DB/Telegram, so it's unit-tested directly.
`runSweep(slot)` in [src/lib/sweep.ts](src/lib/sweep.ts) is the side-effecting wrapper the cron
calls: it reads the DB, sends the message, and writes accountability memory (bumps `nudgeCount`,
bumps `ignoreCount` when it re-nudges an item that's still open, appends a `nudged` Event). Two
slots: `morning` always reports in (or "clean slate"); `evening` is an honesty check
that stays silent unless something is pressing. Pressure has three tiers — `calm` (Done/Snooze),
`push` (burning: Done / I'll-do-it-today / Tell referee), `escalate` (task 3+ days overdue or
commitment past 2 cadence cycles: referee button goes *first*, copy turns blunt). If you tapped
"I'll do it today" and it's still open that evening, the evening nudge leads with a broken-promise
line. The "Tell <referee>" button is a `wa.me` deep link ([src/lib/waLink.ts](src/lib/waLink.ts),
which rejects numbers under 8 digits so a placeholder can't render a dead link) with a pre-drafted
message. Escalation is always one-tap, never auto-sent. Keep `buildDailyNudge` pure — that's what
`preview-nudge.ts` relies on.

**Cron** ([src/app/api/cron/route.ts](src/app/api/cron/route.ts)) — GET guarded by
`Bearer ${CRON_SECRET}`, reads `?slot=evening` (defaults to morning). Two jobs in
[vercel.json](vercel.json): `0 1 * * *` (09:00 HKT, morning) and `0 13 * * *` (21:00 HKT, evening).
Two once-daily jobs fit the Vercel Hobby limit.

**Web board** ([src/app/page.tsx](src/app/page.tsx)) — read-mostly server component; mutations go
through server actions in [src/app/actions.ts](src/app/actions.ts). Protected by
[src/middleware.ts](src/middleware.ts), which checks an `app_auth` cookie against `APP_SECRET`;
`/login`, `/api`, and assets are left open. `/api/login` sets the cookie.

## Conventions

- The six categories and their colors are defined once in `CATEGORIES` in
  [src/lib/rank.ts](src/lib/rank.ts). The `Category` union is duplicated in `rank.ts` and
  `classify.ts` — keep them in sync if you add one.
- `.env` is loaded via `node --env-file` in the npm scripts, which does **not** strip inline
  comments. Keep every `# comment` on its own line in `.env`/`.env.example` or it folds into the value.
- Dates from Telegram commands and classify are stored at `09:00 HKT` (`T09:00:00+08:00`); all
  ranking/heat/overdue diffs use calendar-day math in HKT via `startOfDayHKT` (UTC+8, no DST).
- Single-user by design: no per-user scoping anywhere. `ownerChatId` in `Setting` is the whole auth model for who gets nudged.
