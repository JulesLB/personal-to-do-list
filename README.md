# Ember

**A personal accountability engine you run from Telegram.** Text it what you commit to. Claude files it, a pressure score ranks everything, and twice a day it sends you a tight digest of what's overdue and what's due today. Ignore something long enough and it hands you a pre-drafted message to send a real person.

![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white) ![Claude](https://img.shields.io/badge/Claude-Haiku-D97757?logo=anthropic&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-deploy-000000?logo=vercel)

![The Ember board](docs/board.png)

Built solo on nights and weekends with Claude Code, both as a tool I actually use and as a way to learn proper app-building: auth, testing, migrations, and deploy.

## The idea

Capture was never my problem. Follow-through was. Every to-do app I tried was great at storing things and useless at making me do them.

So Ember spends almost none of its effort on storage and almost all of it on nagging and accountability. There are no quadrants to manage and no AI inventing your tasks. You decide what matters; the app decides the order and holds you to it.

## What makes it interesting

- **One ranked list, one burning thing.** Every item gets a single pressure score (importance + deadline urgency + an overdue penalty). No columns, no triage. The app picks what's next.
- **Plain-language everything.** Capture is one sloppy sentence. Edits too: "push the dentist to Friday," "that's weekly," "did the call." Claude (Haiku) classifies on the way in and routes intent on edits.
- **Escalation with teeth.** The longer you dodge something, the louder it pushes. Past a threshold it leads with a one-tap WhatsApp message to a referee you named when you captured the task. Accountability that involves another human, by consent.
- **Recurring commitments that survive completion.** Marking a weekly goal done honors this cycle and resurfaces it one cadence later, instead of vanishing or nagging forever.
- **A board that uses color for one job.** Category is a quiet dot; the only loud color is urgency. Finishing a task ignites the card and burns it to ash.
- **A weekly read on your behavior.** A separate Review page scores what's slipping (escalated, overdue, dodged, rotting in parking) and an AI coach turns the week into three lines: the pattern, what to change, the one thing to do next.
- **A landing page that shows the whole loop.** A public `/landing` runs an end-to-end demo in one phone (text the bot → ranked board → overdue → referee escalation → burn-to-ash), and `/get-started` walks a new user onto Telegram. No signup and no password: the Telegram chat is the login, and the bot replies with a one-tap link to your board.

## Engineering notes

The build doubles as a learning exercise, so the boring parts are first-class:

- **Security:** the bot locks to a single owner chat and ignores everyone else; cron and webhook routes fail closed on a bad secret; sessions are signed; Postgres row-level security on the data.
- **Schema as code:** Prisma Migrate, migrations committed to git, applied automatically on every Vercel deploy.
- **Tested where it counts:** Vitest over the pure ranking and nudge logic against a fixed clock, no DB required. `npm run build` is the type-check gate.
- **Safe to iterate:** `main` is production. Work happens on a branch against a throwaway SQLite DB that never touches prod, so the loop is branch, test, merge.
- **Tuned for latency:** Vercel functions pinned to the same region as the database to keep round trips short.
- **Cost-aware:** every model call is metered into a usage log, surfaced on an internal ops dashboard, behind its own secret with DB-backed brute-force rate limiting. The dashboard reads three live views: users & activity (total/new users, active today, items captured/done this week), spend (by tool, tokens, cache hit rate), and recent calls.

## Stack

Next.js 15 (App Router) on Vercel · Prisma 6 + Supabase Postgres · Claude (Anthropic SDK, Haiku for classify) · Telegram Bot API · Vercel Cron · TypeScript · Vitest.

## How it works

1. **Capture.** Text the Telegram bot in plain language.
2. **Classify.** Claude turns it into a structured item: category, importance, deadline, referee, and whether it repeats. Type (task / commitment / parking) is derived from the date and cadence, not chosen: a deadline makes it a task, a repeat makes it a commitment, neither parks it.
3. **Rank.** Everything gets one pressure score. No quadrants; the app sets the order.
4. **See.** The web board opens with a streak chip, the burning #1 as a hero, then everything else in bands (on fire / heating up / back burner) with a quiet parking lot at the bottom. Category shows as a small colored dot; tap a row to edit any field.
5. **Nudge.** Two daily crons send a digest of what's overdue and what's due today — three per section, the rest as "+N more". The morning is a plain preview; the evening wrap-up numbers each item with one-tap ✓ buttons that complete it straight from the chat and cheers a day you fully cleared. Both stay silent when nothing's overdue or due.
6. **Escalate.** A task 3+ days late, or a commitment skipped two cycles running, leads with a pre-drafted WhatsApp message to a referee you named at capture — accountability with a real person, by consent. (Currently gated behind a flag until WhatsApp auto-send is wired up.)
7. **Close.** Tap Done (the card burns to ash) or reply `done <id>`. A one-off closes for good; a commitment honors the cycle and resurfaces later. `retire <id>` ends a commitment for good.
8. **Reflect.** The Review page reads your week back: a scoreboard of what's slipping and a short AI coach's take, refreshed on demand.

## Categories

Each item is auto-tagged into one of six areas: Life, Money, Body, Work, Build, Brain (personal, finance, fitness, work, business, learning). Each has a color, shown only as a small dot, so urgency keeps the loud colors and category stays quiet.

## Streak

The top bar carries a streak: consecutive days you cleared what came due. It rewards follow-through, not raw activity, so a day only breaks it if something fell due and you cleared nothing. Quiet days with nothing due carry it forward.

## Setup

Prereqs: Node 20+, an Anthropic API key, a Telegram bot, and a Postgres database (a free Supabase project works).

1. `npm install`
2. Create a Telegram bot: message [@BotFather](https://t.me/BotFather), send `/newbot`, copy the token.
3. Create a free [Supabase](https://supabase.com) project. Under Connect → ORMs → Prisma, copy the two pooler URLs.
4. `cp .env.example .env` and fill it in. Use the transaction pooler (port 6543) for `DATABASE_URL` and the session pooler (port 5432) for `DIRECT_URL`. Pick long random strings for `TELEGRAM_WEBHOOK_SECRET`, `APP_SECRET`, and `CRON_SECRET`.
5. `npm run db:migrate:deploy` to apply the committed migrations, then `npm run db:seed` for sample items.
6. `npm run dev`, open http://localhost:3000. Logged out, the board redirects to `/get-started`; sign in via the bot's `/board` link once it's running (the owner `APP_SECRET` fast path still works by POSTing `key` to `/api/login`, but it's no longer surfaced in the public funnel). The public landing is at `/landing`.
7. Deploy: push to GitHub, import the repo in Vercel, add the same env vars plus `APP_URL` and `TELEGRAM_BOT_URL` (the `t.me/<bot>` link the landing/get-started CTAs open). Vercel's build runs `vercel-build` (`prisma migrate deploy && prisma generate && next build`), so pending migrations apply to prod on every deploy. Crons are declared in `vercel.json`: 01:00 UTC (morning) and 13:00 UTC (evening). Pin the function region to match the Supabase region.
8. Connect Telegram: with `APP_URL` set, run `npm run set-webhook`.
9. In Telegram, send `/start`, then try: `book the dentist by friday or my wife hears about it`. The bot locks to the first chat that messages it (or set `OWNER_CHAT_ID` to pin it) and ignores every other chat.

The Telegram webhook needs a public URL, so the bot goes live once deployed (or via an ngrok tunnel locally). The board runs locally on its own.

## Telegram

Tap the buttons on the daily nudge, or type:

| You type | It does |
| --- | --- |
| a new thing | captures and classifies it |
| a plain-English edit ("push the dentist to friday", "the gym thing is weekly", "drop the tax idea") | finds the matching item and updates / completes / snoozes / retires it; asks one question if it's ambiguous |
| `list` | shows open items |
| `done <id>` | completes it (a commitment is honored for this cycle and resurfaces later) |
| `snooze <id> <days>` | defers it |
| `due <id> YYYY-MM-DD` | sets a deadline |
| `retire <id>` | ends a commitment for good |

## Cut on purpose

- No AI inventing your to-dos. You decide what goes in and what matters; it only computes the order and holds you to it.
- No multiplayer or family logins. Family only receives WhatsApp messages you choose to send.
- No quadrant juggling. One ranked list, one burning thing at a time.

## The three ways it dies, and the guardrails

1. **The nag becomes wallpaper.** Guard: at most two messages a day, scoped to only what's overdue or due today, and both stay silent on a quiet day.
2. **The teeth never bite.** Guard: the escalation message is pre-drafted with a one-tap WhatsApp link, and the referee is set at capture.
3. **Curation becomes a chore.** Guard: capture is one sloppy sentence, Claude does the filing, the board is read-mostly.

## Helper scripts

- `npm run dev:local` runs the board against an isolated, seeded SQLite DB for offline UI work.
- `npm run try -- "<message>"` dry-runs the Telegram intent router against your local items and prints the decision; sends nothing.
- `npm run set-webhook` points the bot at `APP_URL/api/telegram`.
- `npx tsx scripts/preview-nudge.ts [evening]` prints the nudge text and buttons for the current DB without sending.
- `npx tsx scripts/preview-sweep.ts [evening]` dry-runs the full sweep (ranking, accountability memory, event log) without hitting Telegram.

## Tests

`npm test` runs the Vitest suite over the pure logic (ranking, nudge, triage, weekly receipts, escalation) against a fixed clock, no DB required. `npm run build` is the type-check gate. Run both before committing.

---

*Status: working daily driver, now multi-user (each Telegram chat is its own account), POC moving to MVP. Roadmap in [`docs/ROADMAP.md`](docs/ROADMAP.md).*
