# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ember (formerly Hermes) — a single-user accountability engine. You text a Telegram bot what you commit to;
Claude classifies it into a structured item; a pressure score ranks everything; two daily Vercel
crons (a morning nudge and an evening honesty check) push the most pressing task; ignoring it long
enough surfaces a pre-drafted WhatsApp message to a "referee" (wife/sister/colleague). A
password-gated web board shows the same ranked list. The bet: capture was never the problem,
follow-through was — so the code invests in ranking, nagging, and escalation, not storage.

All day/deadline math runs in **HKT (UTC+8, fixed offset, no DST)** so "due today" never drifts on
the UTC server. The single user is based in Hong Kong.

## Commands

```bash
npm run dev             # Next.js dev server on :3000 (uses the cloud DB in .env)
npm run dev:local       # board against an isolated, seeded SQLite DB (offline UI work, safe sandbox)
npm run try -- "<msg>"  # dry-run the intent router against local items, no Telegram (read-only)
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

For offline work run `npm run dev:local` (or `npm run try`), which point at an isolated SQLite DB via
a **separate** [prisma/schema.sqlite.prisma](prisma/schema.sqlite.prisma) and never touch the tracked
Postgres schema or prod. Orchestrated by [scripts/dev-local.mjs](scripts/dev-local.mjs) /
[scripts/try.mjs](scripts/try.mjs), which inject `DATABASE_URL` and launch the CLIs as `node <bin>`
(Windows can't spawn a `.cmd`). Keep the two schemas' models in sync. After local work, any
`npm run build` regenerates the Postgres client. Don't mix `db push` and migrate on the same DB.

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
importance + urgency + deadline proximity + (for commitments) how far past due into one number. A
commitment's due date is **computed, not stored**: `commitmentDue` adds one cadence period to
`lastDoneAt` (or `createdAt`) calendar-accurately — weekly = same weekday, monthly = same
day-of-month clamped to the month's length (31 Jan → 28 Feb). `heatOf` buckets an item into
`burning` / `soon` / `later` (a commitment is `burning` once now ≥ its due date, `soon` within a
cadence-sized lead); `daysOverdue` and `isCritical` (a commitment a full extra period past due) drive
escalation; `promisedToday` flags a broken same-day promise. `commitmentDueLabel` renders the
computed date ("due 19 Jul · 3d overdue") for the board and nudge, so "on fire" always shows a reason.
All day boundaries use `startOfDayHKT`. Parking items score `-1` and are excluded. No quadrants — the
score decides order. The board and both nudge slots consume `rankActionable`.

**Classification / intent routing** ([src/lib/classify.ts](src/lib/classify.ts)) — `interpret` is one
Claude call with a forced `route` tool that turns a messy sentence into an `Intent`: an `action`
(`create | update | complete | snooze | retire | query | clarify`), an optional target `itemId`
resolved against the open list by fuzzy title match, and (for updates) the masked fields to change.
Ambiguous edits return `clarify` with a single question instead of guessing. The system prompt
encodes Jules-specific rules (which referee for what, the six categories, the important-but-not-urgent
"death zone"). The model is pinned in [src/lib/anthropic.ts](src/lib/anthropic.ts): Haiku is the only
model called anywhere in the app.

**Telegram webhook** ([src/app/api/telegram/route.ts](src/app/api/telegram/route.ts)) — the main
input surface. Handles inline button callbacks (`done:`/`today:`/`snooze:<id>`, plus
`snz:<id>:<preset>` for the snooze presets) and typed commands (`list`, `done <id>`,
`snooze <id> <days>`, `due <id> YYYY-MM-DD`, `retire <id>`) via regex as fast paths; anything else
goes to `interpret`, which decides create vs. edit and dispatches (create/update/complete/snooze/
retire/query/clarify). A mutation with a missing or hallucinated target falls back to asking rather
than touching the wrong item; every change is echoed back. `done` routes through `completeItem`
(commitment-aware, see above) and logs a `done` Event; `today:` sets `promisedAt` (deliberately *not*
a snooze, so the evening sweep can catch it still open) and logs `promised`. Deadlines are stored at
`09:00 HKT` (`T09:00:00+08:00`).
Auth is the `x-telegram-bot-api-secret-token` header vs `TELEGRAM_WEBHOOK_SECRET`. Always returns
200 (even on internal error) so Telegram doesn't retry.

**Nudge engine** — `buildDailyNudge(items, now, slot)` in [src/lib/nudge.ts](src/lib/nudge.ts) is
pure (items → text + keyboard + topId) and imports no DB/Telegram, so it's unit-tested directly.
`runSweep(slot)` in [src/lib/sweep.ts](src/lib/sweep.ts) is the side-effecting wrapper the cron
calls: it reads the DB, sends the message, and writes accountability memory (bumps `nudgeCount`,
bumps `ignoreCount` when it re-nudges an item that's still open, appends a `nudged` Event). Two
slots: `morning` always reports in (or "clean slate"); `evening` is an honesty check
that stays silent unless something is pressing. Pressure has three tiers — `calm` (Done + a row of
snooze presets: tonight/tomorrow/weekend/next week, see [src/lib/snooze.ts](src/lib/snooze.ts)),
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

**Web board** ([src/app/page.tsx](src/app/page.tsx)) — a server component and a real control surface;
mutations go through server actions in [src/app/actions.ts](src/app/actions.ts) (`markDone`, `retire`,
`remove`, `updateItem`, `snoozeItem`). Layout top to bottom: a **sticky** filter bar of the six
categories as **equal-width chips** (a colored dot, the label, the open count), then the burning
**hero** (`#1`) on its own card, then the rest as **separate, heat-tinted band cards** — "On fire"
(always shown) / "Heating up" (open by default) / "Back burner" (collapsed) / "Parking lot"
(collapsed), the collapsible ones a `<details>` with its count. Clicking a chip sets `?cat=<key>` and
filters the hero + bands; the chip counts stay global; clicking the active chip clears the filter
(there is no logo/reset control). The page reads the filter from the awaited `searchParams` (Next 15
async). Category renders as a colored dot-pill; task deadlines render via `dueInLabel` ("due in 10
days", in days even past a week) and commitments show their computed due date + cadence via
`commitmentDueLabel`. **Tap a row or the hero body to edit** — the edit panel
([src/app/EditTrigger.tsx](src/app/EditTrigger.tsx), a client component) opens on the body click, so
there is no edit button; it changes any classified field and holds the destructive action behind a
tap-to-confirm (delete for tasks/parking, retire for commitments). Rows otherwise show only the done
tick; the **snooze-preset menu** ([src/app/SnoozeMenu.tsx](src/app/SnoozeMenu.tsx)) lives on the hero
alone. Parking has no promote button: giving a parked item a **deadline** in the edit panel
auto-promotes it to a task (in `updateItem`). Branded **Ember** — favicon at
[src/app/icon.png](src/app/icon.png), logo on the login screen. Protected by
[src/middleware.ts](src/middleware.ts), which checks an `app_auth` cookie against `APP_SECRET`;
`/login`, `/api`, and assets are left open. `/api/login` sets the cookie. Styling is a light,
card-based theme in [src/app/globals.css](src/app/globals.css).

## Conventions

- The six categories are defined once in `CATEGORIES` in [src/lib/rank.ts](src/lib/rank.ts), each
  with a single-word display `label` (e.g. business → "Build") and a `dot` color (the board renders category
  as a colored dot-pill). The underlying category keys (`personal`, `finance`, …) are what `classify`
  emits; the labels are display-only. The `Category` union is duplicated in `rank.ts` and
  `classify.ts` — keep them in sync if you add one.
- `.env` is loaded via `node --env-file` in the npm scripts, which does **not** strip inline
  comments. Keep every `# comment` on its own line in `.env`/`.env.example` or it folds into the value.
- Dates from Telegram commands and classify are stored at `09:00 HKT` (`T09:00:00+08:00`); all
  ranking/heat/overdue diffs use calendar-day math in HKT via `startOfDayHKT` (UTC+8, no DST).
- Single-user by design: no per-user scoping anywhere. `ownerChatId` in `Setting` is the whole auth model for who gets nudged.
