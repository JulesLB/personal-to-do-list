# Ember

**A personal accountability engine you run from Telegram.** Text it what you commit to. Claude files it, a pressure score ranks everything, and twice a day it sends you a tight digest of what's overdue and what's due today. Dodge something long enough and it hands you a pre-drafted message to send a real person.

![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white) ![Claude](https://img.shields.io/badge/Claude-Haiku-D97757?logo=anthropic&logoColor=white) ![Vercel](https://img.shields.io/badge/Vercel-deploy-000000?logo=vercel) ![License](https://img.shields.io/badge/license-MIT-blue)

### See it live

- **[Watch the 60-second demo](https://personal-to-do-list-green.vercel.app/landing)** — the whole loop runs in one phone: text the bot, watch it rank, see it go red, see the escalation, watch a finished task burn to ash.
- **[Try the bot yourself](https://t.me/PRactical_to_do_bot)** — open it in Telegram, send one thing you keep avoiding, and it replies with a link to your own board. No signup, no password.

I built Ember solo on nights and weekends with Claude Code, both as a tool I actually use and as a way to learn proper app-building: auth, testing, migrations, deploy, cost tracking. The README below is the long version.

## Why I built it

Capture was never my problem. Follow-through was. Every to-do app I tried was great at storing things and useless at making me do them.

So Ember spends almost none of its effort on storage and almost all of it on nagging and accountability. There are no quadrants to manage and no AI inventing your tasks. You decide what matters; the app decides the order and holds you to it.

## What makes it interesting

- **One ranked list, one burning thing.** Items sort by due date first, importance second. No columns, no triage. The app picks what's next and shows it as a single hero card.
- **Plain language in, plain language out.** Capture is one sloppy sentence. So are edits: "push the dentist to Friday," "that's weekly," "did the call." Claude (Haiku) classifies on the way in and routes intent on edits. Voice notes work too: it transcribes them with Whisper, then runs the same path.
- **Escalation with teeth.** The longer you dodge something, the louder it pushes. Past a threshold it leads with a one-tap WhatsApp message to a referee you named when you captured the task. Real accountability, with another human, by consent.
- **Recurring commitments that survive completion.** Marking a weekly goal done honors this cycle and resurfaces it one cadence later, instead of vanishing or nagging forever.
- **A board that uses color for one job.** Category is a quiet dot. The only loud color is urgency. Finishing a task ignites the card and burns it to ash.
- **A weekly read on your behavior.** A separate Review page scores what's slipping (escalated, overdue, dodged, rotting in parking) and an AI coach turns the week into 3 lines: the pattern, what to change, the one thing to do next.

## How it works

1. **Capture.** Text the Telegram bot in plain language.
2. **Classify.** Claude turns it into a structured item: category, importance, deadline, referee, and whether it repeats. The type (task, commitment, or parking) is derived from the date and cadence, never chosen. A deadline makes it a task, a repeat makes it a commitment, neither parks it.
3. **Rank.** Everything sorts by due date, with importance breaking ties on the same day. No quadrants. The app sets the order.
4. **See.** The web board opens with a streak chip, the burning item as a hero, then everything else in bands (on fire, heating up, back burner) with a quiet parking lot at the bottom. Tap a row to edit any field.
5. **Nudge.** Two daily crons send a digest of what's overdue and what's due today, 3 per section and the rest as "+N more." The morning is a plain preview. The evening wrap-up numbers each item with one-tap done buttons and cheers a day you fully cleared. Both stay silent when nothing's due.
6. **Escalate.** A task 3+ days late, or a commitment skipped two cycles running, leads with a pre-drafted WhatsApp message to a referee you named at capture. (Currently behind a flag until WhatsApp auto-send is wired up.)
7. **Close.** Tap done (the card burns to ash) or reply `done <id>`. A one-off closes for good. A commitment honors the cycle and resurfaces later.
8. **Reflect.** The Review page reads your week back: a scoreboard of what's slipping and a short coach's take, refreshed on demand.

## Under the hood

The build doubles as a learning exercise, so the boring parts are first-class.

- **Multi-user and isolated.** Each Telegram chat is its own account. Every read and write is scoped to the acting user, id-based edits are filtered by `{ id, userId }` so a guessed id can't touch someone else's item, and Postgres row-level security backs it at the database. There's an integration check (`npm run check:isolation`) that proves it against a real DB.
- **Signup is open, but capped.** Anyone can message the bot and use it. Each chat is rate-limited and held to a small monthly spend cap on paid AI calls, so an open door can't run up the bill. Cron and webhook routes fail closed on a bad secret, and every session token is signed.
- **Schema as code.** Prisma Migrate, migrations committed to git, applied automatically on every Vercel deploy.
- **Tested where it counts.** Vitest over the pure ranking, nudge, triage, receipts, and escalation logic against a fixed clock, no DB required. `npm run build` is the type-check gate.
- **Safe to iterate.** `main` is production. Work happens on a branch against a throwaway SQLite DB that never touches prod, so the loop is branch, test, merge.
- **Tuned for latency.** Vercel functions are pinned to the same region as the database to keep round trips short.
- **Cost-aware by design.** Every model call is metered into a usage log behind its own secret, with DB-backed brute-force rate limiting. An internal ops dashboard reads three live views: users and activity, spend (by tool, tokens, cache hit rate), and recent calls.

## Stack

Next.js 15 (App Router) on Vercel · Prisma 6 + Supabase Postgres · Claude (Anthropic SDK, Haiku) · OpenAI Whisper (voice notes) · Telegram Bot API · Vercel Cron · TypeScript · Vitest.

## Talking to the bot

Tap the buttons on the daily nudge, or type:

| You type | It does |
| --- | --- |
| a new thing | captures and classifies it |
| a plain-English edit ("push the dentist to friday", "the gym thing is weekly", "drop the tax idea") | finds the matching item and updates, completes, snoozes, or retires it; asks one question if it's ambiguous |
| `list` | shows open items |
| `done <id>` | completes it (a commitment is honored for this cycle and resurfaces later) |
| `snooze <id> <days>` | defers it |
| `due <id> YYYY-MM-DD` | sets a deadline |
| `retire <id>` | ends a commitment for good |

## What it deliberately doesn't do

- No AI inventing your to-dos. You decide what goes in and what matters. It only computes the order and holds you to it.
- No multiplayer or family logins. A referee only receives messages you choose to send.
- No quadrant juggling. One ranked list, one burning thing at a time.

## Run it yourself

Prereqs: Node 20+, an Anthropic API key, a Telegram bot, and a Postgres database (a free Supabase project works).

1. `npm install`
2. Create a Telegram bot: message [@BotFather](https://t.me/BotFather), send `/newbot`, copy the token.
3. Create a free [Supabase](https://supabase.com) project. Under Connect → ORMs → Prisma, copy the two pooler URLs.
4. `cp .env.example .env` and fill it in. Use the transaction pooler (port 6543) for `DATABASE_URL` and the session pooler (port 5432) for `DIRECT_URL`. Pick long random strings for `TELEGRAM_WEBHOOK_SECRET`, `APP_SECRET`, `ADMIN_SECRET`, and `CRON_SECRET`.
5. `npm run db:migrate:deploy` to apply the committed migrations, then `npm run db:seed` for sample items.
6. `npm run dev`, open http://localhost:3000. Logged out, the board redirects to `/get-started`. Sign in via the bot's `/board` link once it's running. The public landing is at `/landing`.
7. Deploy: push to GitHub, import the repo in Vercel, add the same env vars plus `APP_URL` and `TELEGRAM_BOT_URL`. Vercel's build runs `prisma migrate deploy && prisma generate && next build`, so pending migrations apply to prod on every deploy. Crons are declared in `vercel.json`. Pin the function region to match the Supabase region.
8. Connect Telegram: with `APP_URL` set, run `npm run set-webhook`.
9. In Telegram, send `/start`, then try: `book the dentist by friday or my wife hears about it`.

The Telegram webhook needs a public URL, so the bot goes live once deployed (or via an ngrok tunnel locally). The board runs locally on its own.

## Helper scripts

- `npm run dev:local` runs the board against an isolated, seeded SQLite DB for offline UI work.
- `npm run try -- "<message>"` dry-runs the Telegram intent router against your local items and prints the decision. It sends nothing.
- `npm run set-webhook` points the bot at `APP_URL/api/telegram`.
- `npx tsx scripts/preview-nudge.ts [evening]` prints the nudge text and buttons for the current DB without sending.

## Tests

`npm test` runs the Vitest suite over the pure logic (ranking, nudge, triage, weekly receipts, escalation) against a fixed clock, no DB required. `npm run build` is the type-check gate. Run both before committing.

---

*Status: working daily driver, multi-user, POC moving to MVP. Roadmap in [`docs/ROADMAP.md`](docs/ROADMAP.md).*
