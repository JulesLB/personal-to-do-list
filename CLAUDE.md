# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hermes — a single-user accountability engine. You text a Telegram bot what you commit to;
Claude classifies it into a structured item; a pressure score ranks everything; a daily Vercel
cron sends one nudge about the most pressing task; missing a deadline surfaces a pre-drafted
WhatsApp message to a "referee" (wife/sister/colleague). A password-gated web board shows the
same ranked list. The bet: capture was never the problem, follow-through was — so the code
invests in ranking, nagging, and escalation, not storage.

## Commands

```bash
npm run dev            # Next.js dev server on :3000
npm run build          # prisma generate && next build
npm run db:push        # apply prisma/schema.prisma to the DB (no migration files)
npm run db:seed        # load sample items (node --env-file=.env prisma/seed.mjs)
npm run db:studio      # Prisma Studio
npm run set-webhook    # point the Telegram bot at APP_URL/api/telegram
npx tsx scripts/preview-nudge.ts   # print the daily nudge text+buttons without sending
```

There is no test runner and no linter configured. `npm run build` (which runs `prisma generate`)
is the type-check / sanity gate.

## Local DB note

The schema's datasource provider is `postgresql` (Supabase in prod). To develop fully offline,
switch `provider` in [prisma/schema.prisma](prisma/schema.prisma) to `sqlite`, set
`DATABASE_URL="file:./dev.db"`, run `npm run db:push`, and switch both back before deploying.
Recent git history shows this repo flipping between the two — check `git status` on the schema
before assuming which mode you're in.

## Architecture

The data model is deliberately one flat table. Everything else is functions over it.

**`Item`** ([prisma/schema.prisma](prisma/schema.prisma)) — the only real entity. Key fields:
`type` (`task` | `commitment` | `parking`), `important`/`urgent` booleans, `deadline`, `referee`,
`category` (six fixed values), `cadence` (commitments only), `status`, `snoozeUntil`,
`lastNudgedAt`. **`Setting`** is a key/value table whose only live key is `ownerChatId` — the
single user's Telegram chat, auto-learned from their first message so the cron knows where to nudge.

**Ranking is the core IP** ([src/lib/rank.ts](src/lib/rank.ts)). `rankScore` collapses
importance + urgency + deadline proximity + (for commitments) cadence-overdue into one number.
`heatOf` buckets an item into `burning` / `soon` / `later` for display. Parking items score `-1`
and are excluded from the actionable list. There are no quadrants — the score decides order.
If you touch scoring, this is the file; the board and the nudge both consume `rankActionable`.

**Classification** ([src/lib/classify.ts](src/lib/classify.ts)) — one Claude call with a forced
`save_item` tool to turn a messy sentence into a `Classified` object. The system prompt encodes
Jules-specific rules (which referee for what, the six categories, the important-but-not-urgent
"death zone"). Models are pinned in [src/lib/anthropic.ts](src/lib/anthropic.ts): `classify` uses
Haiku, `write` (Sonnet) is defined but not yet used.

**Telegram webhook** ([src/app/api/telegram/route.ts](src/app/api/telegram/route.ts)) — the main
input surface. Handles inline button callbacks (`done:`/`today:`/`snooze:<id>`) and typed commands
(`list`, `done <id>`, `snooze <id> <days>`, `due <id> YYYY-MM-DD`) via regex; anything else falls
through to `classify` and gets stored. Auth is the `x-telegram-bot-api-secret-token` header vs
`TELEGRAM_WEBHOOK_SECRET`. Always returns 200 (even on internal error) so Telegram doesn't retry.

**Nudge engine** ([src/lib/nudge.ts](src/lib/nudge.ts)) — `buildDailyNudge` is pure (items → text +
keyboard), `runSweep` is the side-effecting wrapper the cron calls. When the top item is `burning`
and has a referee, the keyboard gets a "Tell <referee>" button linking to a `wa.me` deep link
([src/lib/waLink.ts](src/lib/waLink.ts)) with a pre-drafted escalation message. Keep `buildDailyNudge`
pure — that's what `preview-nudge.ts` relies on.

**Cron** ([src/app/api/cron/route.ts](src/app/api/cron/route.ts)) — GET guarded by
`Bearer ${CRON_SECRET}`, declared in [vercel.json](vercel.json) at `0 1 * * *` (01:00 UTC = 09:00 HKT).

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
- Dates from Telegram commands and classify are stored at `T09:00:00` local-ish (no timezone math
  beyond that); ranking uses calendar-day diffs via `startOfDay`.
- Single-user by design: no per-user scoping anywhere. `ownerChatId` in `Setting` is the whole auth model for who gets nudged.
