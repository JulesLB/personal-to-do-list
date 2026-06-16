# Hermes — personal accountability engine

A single-user system you run from Telegram. Text it what you commit to. It sorts by
important vs urgent, nudges you when something rots, and pushes you to report progress
to a real person (wife, sister, colleague) over WhatsApp. A web board shows the 2x2.

Built on one finding: capture was never the problem, follow-through was. So the effort
goes into nagging and accountability, not storage.

## How it works

1. **Capture** — text the Telegram bot in plain language.
2. **Classify** — Claude turns it into a structured item (type, important/urgent, deadline, referee).
3. **See** — the web board shows the Eisenhower 2x2 plus a parking lot.
4. **Nudge** — a daily cron pings you about overdue items, due-soon deadlines, monthly commitments, and important-but-not-urgent things that have been sitting too long.
5. **Escalate** — miss a deadline and it hands you a one-tap WhatsApp message to your referee.
6. **Close** — reply `done <id>`.

## Stack

Next.js (App Router) on Vercel · Prisma + Postgres · Claude (Anthropic) · Telegram Bot API · Vercel Cron.

## Setup

Prereqs: Node 20+, an Anthropic API key, and a Telegram bot. Local dev uses a SQLite
file (zero setup); Postgres is only needed when you deploy (see Deploying below).

1. `npm install`
2. Create a Telegram bot: message [@BotFather](https://t.me/BotFather), send `/newbot`, copy the token.
3. `cp .env.example .env` and fill it in. Pick long random strings for `TELEGRAM_WEBHOOK_SECRET`, `APP_SECRET`, and `CRON_SECRET`.
4. `npm run db:push` to create the tables, then `npm run db:seed` for a few sample items.
5. `npm run dev`, open http://localhost:3000, enter `APP_SECRET` as the access key.
6. Deploy: Vercel can't use SQLite, so set `provider = "postgresql"` in `prisma/schema.prisma` and use a free [Neon](https://neon.tech) `DATABASE_URL`. Push to GitHub, import the repo in Vercel, add the same env vars plus `APP_URL`, and deploy. Cron is already declared in `vercel.json`.
7. Connect Telegram: with `APP_URL` set in `.env`, run `npm run set-webhook`.
8. In Telegram, send `/start`, then try: `book the dentist by friday or my wife hears about it`.

The Telegram webhook needs a public URL, so the bot goes live once deployed (or via an
ngrok tunnel for local testing). The board runs locally on its own.

## Telegram commands

| You type | It does |
| --- | --- |
| anything | captures and classifies it |
| `list` | shows open items |
| `done <id>` | marks complete |
| `snooze <id> <days>` | defers it |
| `due <id> YYYY-MM-DD` | sets a deadline |

## Cut from v1 on purpose

- No AI deciding your priorities. You decide; it holds you to it.
- No multiplayer or family logins. Family only receives WhatsApp messages you send.
- No drag-and-drop yet. Buttons move items between quadrants.

## The three ways it dies, and the guardrails

1. **The nag becomes wallpaper.** Guard: at most 3 nudges a day, prioritized, each asking for a one-word reply.
2. **The teeth never bite.** Guard: the escalation message is pre-drafted with a one-tap WhatsApp link, and the referee is set at capture.
3. **Curation becomes a chore.** Guard: capture is one sloppy sentence, Claude does the filing, the board is read-mostly.
