# Ember — personal accountability engine

A single-user system you run from Telegram. Text it what you commit to. It ranks everything
by how much pressure it's under (deadline, importance, how overdue), nudges you each morning
about the one thing that's burning, checks in again at night, and pushes you to report progress
to a real person (wife, sister, colleague) over WhatsApp. A web board shows the same ranked list.

Built on one finding: capture was never the problem, follow-through was. So the effort goes
into nagging and accountability, not storage.

## How it works

1. **Capture.** Text the Telegram bot in plain language.
2. **Classify.** Claude turns it into a structured item: category, importance, deadline, referee, and whether it repeats. Type (task / commitment / parking) isn't chosen — it's derived from the date and cadence: a deadline makes it a task, a repeat makes it a commitment, neither parks it. Later you can correct anything in plain language ("push the dentist to Friday", "that's weekly", "did the call") or from the board.
3. **Rank.** Everything gets one pressure score (importance + deadline urgency + an overdue penalty). No quadrants to manage; the app decides the order.
4. **See.** The web board opens with a top bar (the Ember logo and a streak chip), the six categories as equal-width filter chips (open count per area), then the burning #1 as a hero, then everything else as separate band cards (on fire / heating up / back burner) with a quiet parking lot at the bottom. The design follows one rule — one color, one job: category is a quiet dot, the only loud color is urgency (red for due today/tomorrow/overdue, amber for a few days out) on the due date and the hero edge, and green means Done. The calm bands sort by date; parking items show how long they've sat there and flag once stale (14 days). Tap a chip to filter the whole board to that area, tap it again to clear. Tap any row (or the hero) to edit any field or delete it; rows otherwise carry just a done tick, and the snooze menu (tonight / this weekend / next week) sits on the hero. A parked idea becomes a task the moment you give it a date.
5. **Nudge.** A morning cron sends one message: the top task with one-tap buttons (Done / I'll do it today / Tell your referee) and a short "what's next" list. An evening cron checks back, but only if something's still pressing.
6. **Escalate.** The more overdue something gets, the louder it pushes. A task 3+ days late, or a commitment you've skipped two cycles running, leads with a pre-drafted, one-tap WhatsApp message to your referee. Tap "I'll do it today" and fail to, and the evening check calls out the broken promise.
7. **Close.** Tap Done (the card catches fire and burns to ash on the board), or reply `done <id>`. A one-off task closes for good. A recurring commitment doesn't: marking it done honors the current cycle, resets its clock, and lets it resurface one cadence later. Its due date is computed from the cadence (weekly = same weekday, monthly = same day each month) and shown on the card, so an overdue commitment always tells you why it's on fire. Ending one for good is the explicit `retire <id>`.

## Categories

Each item is auto-tagged into one of six areas: Life, Money, Body, Work, Build, Brain (personal, finance, fitness, work, business, learning under the hood). Each has a color, shown only as a small dot next to a grey label, so urgency keeps the loud colors and category stays quiet. Tap a chip to filter the board to one area.

## Streak

The top bar carries a streak: consecutive days you cleared what came due. It's built to reward follow-through, not raw activity, so a day only breaks it if something fell due that day and you cleared nothing. Quiet days with nothing due carry it forward instead of resetting it. Completing a task is also the reward moment, the card ignites and burns away.

## Stack

Next.js 15 (App Router) on Vercel · Prisma 6 + Supabase Postgres · Claude (Anthropic, Haiku for classify) · Telegram Bot API · Vercel Cron.

## Setup

Prereqs: Node 20+, an Anthropic API key, a Telegram bot, and a Postgres database (a free Supabase project works).

1. `npm install`
2. Create a Telegram bot: message [@BotFather](https://t.me/BotFather), send `/newbot`, copy the token.
3. Create a free [Supabase](https://supabase.com) project. Under Connect → ORMs → Prisma, copy the two pooler URLs.
4. `cp .env.example .env` and fill it in. Use the transaction pooler (port 6543) for `DATABASE_URL` and the session pooler (port 5432) for `DIRECT_URL`. Pick long random strings for `TELEGRAM_WEBHOOK_SECRET`, `APP_SECRET`, and `CRON_SECRET`. Keep comments on their own lines (see the note in `.env.example`).
5. `npm run db:migrate:deploy` to apply the committed migrations and create the tables, then `npm run db:seed` for a few sample items.
6. `npm run dev`, open http://localhost:3000, enter `APP_SECRET` as the access key.
7. Deploy: push to GitHub, import the repo in Vercel, add the same env vars (Vercel → Settings → Environment Variables) plus `APP_URL`. Include `DIRECT_URL` (session pooler, port 5432) — Vercel's build runs `vercel-build` (`prisma migrate deploy && prisma generate && next build`), so pending migrations apply to the prod DB on every deploy. Crons are declared in `vercel.json`: 01:00 UTC (09:00 HKT, morning) and 13:00 UTC (21:00 HKT, evening). Two once-daily jobs fit the Vercel Hobby limit.
8. Connect Telegram: with `APP_URL` set, run `npm run set-webhook`.
9. In Telegram, send `/start`, then try: `book the dentist by friday or my wife hears about it`. The
   bot locks to the first chat that messages it (or set `OWNER_CHAT_ID` to pin it) and ignores every
   other chat, so a stranger who finds the bot can't read or change your list.

The Telegram webhook needs a public URL, so the bot goes live once deployed (or via an ngrok
tunnel for local testing). The board runs locally on its own.

The schema is versioned with Prisma Migrate (`prisma/migrations/`, committed to git). After editing
`prisma/schema.prisma`, run `npm run db:migrate` to create and apply a migration locally, then commit
the SQL. Deploys apply pending migrations automatically (see step 7).

### Test changes before you push

Production is the `main` branch. Work on a feature branch and nothing goes live until you merge to
`main`, so the safe loop is **branch → test → merge**. Pushing a branch is not a deploy.

- **Board, locally:** `npm run dev:local` runs the whole board against a throwaway SQLite DB
  (`prisma/dev.db`) seeded with sample items. It never touches prod Supabase and never edits the
  tracked Postgres schema — it uses a separate `prisma/schema.sqlite.prisma`. Open
  http://localhost:3000 and log in with `APP_SECRET`. Each run reseeds, so local edits are
  disposable. After local work, `npm run build` regenerates the prod Prisma client.
- **Bot brain, locally:** `npm run try -- "push the dentist to friday"` runs the real intent router
  against your local items and prints what it decided (action, target, reply), using
  `ANTHROPIC_API_KEY` from `.env`. It only reads and calls Claude; it changes nothing. The full
  Telegram round-trip still needs a public URL (a Vercel preview deploy of the branch, or an ngrok
  tunnel).

## Telegram

Tap the buttons on the daily nudge, or type:

| You type | It does |
| --- | --- |
| a new thing | captures and classifies it |
| a plain-English edit ("push the dentist to friday", "the gym thing is weekly", "drop the tax idea") | finds the matching item and updates/completes/snoozes/retires it; asks one question if it's ambiguous |
| `list` | shows open items |
| `done <id>` | completes it (a commitment is honored for this cycle and resurfaces later) |
| `snooze <id> <days>` | defers it |
| `due <id> YYYY-MM-DD` | sets a deadline |
| `retire <id>` | ends a commitment for good |

## Cut on purpose

- No AI inventing your to-dos. You decide what goes in and what matters; it only computes the order and holds you to it.
- No multiplayer or family logins. Family only receives WhatsApp messages you send.
- No quadrant juggling. One ranked list, one burning thing at a time.

## The three ways it dies, and the guardrails

1. **The nag becomes wallpaper.** Guard: at most two messages a day on the single most pressing task, and the evening one stays silent unless something's actually burning.
2. **The teeth never bite.** Guard: the escalation message is pre-drafted with a one-tap WhatsApp link, and the referee is set at capture.
3. **Curation becomes a chore.** Guard: capture is one sloppy sentence, Claude does the filing, the board is read-mostly.

## Helper scripts

- `npm run dev:local` — runs the board against an isolated, seeded SQLite DB for offline UI work (see "Test changes before you push").
- `npm run try -- "<message>"` — dry-runs the Telegram intent router against your local items and prints the decision; sends nothing.
- `npm run set-webhook` — points the bot at `APP_URL/api/telegram` (subscribes to messages and button taps).
- `npx tsx scripts/preview-nudge.ts [evening]` — prints the morning (or evening) nudge text and buttons for the current DB, without sending anything.
- `npx tsx scripts/preview-sweep.ts [evening]` — dry-runs the full sweep against the local DB (ranking, accountability-memory writes, Event log) and prints the message plus the top item's nudge/ignore counters, without hitting Telegram. Run it twice to watch `ignoreCount` climb.

## Tests

`npm test` runs the Vitest suite over the pure ranking and nudge logic (`src/lib/rank.ts`, `src/lib/nudge.ts`) against a fixed clock, no DB required. `npm run build` is the type-check gate. Run both before committing.
