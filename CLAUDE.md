# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreement (binding, every session)

- **Plan before building.** Before writing code for any feature or milestone, present the plan — which
  feature, the approach, the schema/file touches, and the definition of done — and get explicit
  sign-off. No drafting code until the plan is validated.
- **Challenge as a CX expert.** When Jules proposes a feature or enhancement, evaluate it first through
  a customer-experience / product lens: who actually feels it, whether it earns its cost, whether
  there's a cheaper way to test the bet. Push back when the idea is weak or premature *before* planning
  the build. Be a friction layer, not a yes-man.

## What this is

Ember (formerly Hermes) — an accountability engine (multi-user as of Phase 4). You text a Telegram bot what you commit to;
Claude classifies it into a structured item; a pressure score ranks everything; two daily Vercel
crons (a morning nudge and an evening honesty check) push the most pressing task; ignoring it long
enough surfaces a pre-drafted WhatsApp message to a "referee" (wife/sister/colleague). A
password-gated web board shows the same ranked list, and a `/review` page reads your week back to
you (a scoreboard of what's slipping plus an AI coach). The bet: capture was never the problem,
follow-through was — so the code invests in ranking, nagging, and escalation, not storage.

All day/deadline math runs in **HKT (UTC+8, fixed offset, no DST)** so "due today" never drifts on
the UTC server. Each `User` carries a timezone (default `Asia/Hong_Kong`), but nudge/heat math is
still HKT for everyone — per-user timezones and quiet hours are PRD-18, not built yet.

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

`npm test` (Vitest) covers the pure logic (`rank`, `nudge`, `triage`, `receipts`, `escalate`,
`snooze`, the referee token); tests live in `tests/` and run against a fixed clock, no DB. There is no linter. `npm run build` (which runs `prisma generate`)
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

## Working on multiple features at once

Default to **one branch per feature**, never on `main`. `main` stays deployable; each feature lives on
its own branch and merges when it's done. The pain of "two features overwriting each other" almost
always traces back to editing `main` directly with uncommitted work piling up, so the first move on any
new feature is `git switch -c feat/<name>` before touching code.

To work two features in parallel without stashing, use **git worktrees**: a second branch checked out
into its own sibling folder, sharing the same repo and history.

```bash
git worktree add ../Ember-feat-B -b feat/B   # second branch in a sibling folder
npm install                                   # once, in the new worktree
npm run dev:local -- -p 3001                  # its own dev server + its own SQLite sandbox
git worktree remove ../Ember-feat-B           # after it merges
```

Each worktree gets its **own isolated SQLite DB** through `npm run dev:local`
([scripts/dev-local.mjs](scripts/dev-local.mjs)), so two features in two folders never share data and
never touch prod. That covers UI, ranking, nudge, copy, and most logic work. Run two dev servers on
different ports (`-p 3001`) and they stay fully independent.

**Database isolation is the real constraint, not code.** Every checkout still points `DATABASE_URL` at
the same cloud DB, and `npm run db:migrate` applies to **prod** (see the gotcha above), so two features
that both edit [schema.prisma](prisma/schema.prisma) will collide no matter how branches are arranged.
Rules of thumb:

- **Schema-free feature:** Tier 0 is enough. Branch + worktree + the SQLite sandbox, zero extra infra.
- **Two features changing the schema at the same time:** don't run both migrations against the shared
  cloud DB. Prove each against the local SQLite schema first, then land them **one branch at a time**,
  deploying the matching code in the same beat. If this becomes routine, that's the signal to add a
  **branchable Postgres** (Supabase branching, since we're already on Supabase) so each branch gets its
  own isolated Postgres with its own migrations. Build that only when the collision is real, not before.

**Vercel preview deploys** (free on Hobby) give every pushed branch its own URL for testing on real
serverless before merge. Note previews still read the prod DB via the shared env vars, so they're safe
for UI/read-only features but not for schema work until branchable Postgres is in place.

Run `npm test` and `npm run build` in each worktree before merging, same gate as always.

## Architecture

The data model is deliberately one flat table. Everything else is functions over it.

**Multi-user (Phase 4 — PRD-10/11, shipped 2026-06-21).** Ember is now multi-tenant; this supersedes
any "single-user" wording below. A **`User`** (`telegramChatId` unique, `name`, `email?`, `timezone`)
owns every `Item`, and **`Referee`** is a per-user table (`label`, `relation`, `channel`, `contact`,
`consent`) that replaced the `WIFE_WHATSAPP` / `*_CONSENT` env-var trio. The Telegram chat is the
identity anchor: `resolveUser(chatId)` ([src/lib/user.ts](src/lib/user.ts)) resolves-or-creates the
user behind a chat (replacing the old `ensureOwner` single-owner gate), so **signup is open** — any
chat that messages the bot becomes a user (abuse hardening is PRD-16). Every read/write is scoped by
`userId`; id-based mutations use `updateMany`/`deleteMany` filtered by `{ id, userId }` so a guessed id
can't touch another user's item. The sweep loops all users and sends each their own nudge. The board
reads the logged-in user via `currentUser()` ([src/lib/session.ts](src/lib/session.ts)); board auth is
a **Telegram-link login** — the bot's `/board` command (and the `/start` welcome) now reply with a
one-tap **"Open your board"** inline button that carries a one-time `login` token, and
`/login/<token>` swaps it for a session cookie whose token now carries the `userId`
([src/lib/auth.ts](src/lib/auth.ts), domain-separated from the `login`/`referee` tokens). **There is no
separate `/login` page anymore** — a logged-out board hit redirects to the public `/get-started` funnel
(see Public funnel below), which also hosts the `APP_SECRET` owner fast path behind a disclosure. Verify isolation
anytime with `npm run check:isolation` (real-DB integration check). **Gotcha that bit us:**
`npm run db:migrate` targets the cloud `DATABASE_URL` in `.env`, so it applies migrations to **prod** —
deploy the matching code in the same beat or the live bot breaks on the schema it can't satisfy.

**`Item`** ([prisma/schema.prisma](prisma/schema.prisma)) — the main entity. Key fields:
`type` (`task` | `commitment` | `parking`, **derived, never set by hand** — see `deriveType`),
`important` (a single brain-owned judgment; there is no `urgent` flag, urgency comes from the
deadline alone), `deadline`, `referee`, `category` (six fixed values), `cadence` (commitments only),
`status` (`open` | `done` | `retired`), `snoozeUntil`, `lastNudgedAt`, `promisedAt` (set when you tap
"I'll do it today"; the evening check reads it to call out broken promises). Commitments also use `lastDoneAt` (when the current cycle was
last honored — this, not `lastNudgedAt`, drives cadence-overdue math so nudging never resets the
clock) and `cycleStreak`. Accountability memory lives in `nudgeCount` / `ignoreCount` (bumped in the
sweep), a **`deferCount`** (bumped every time you actively push an item away — any snooze, or moving
its deadline to a later date; `deferWarning` shows "Pushed N times" on the board and nudge once it
hits 2, and a completed cycle resets it), plus an append-only **`Event`** table (`itemId`, `kind` =
`nudged|snoozed|promised|done|...`, `slot`) that Phase 2 escalation and Phase 3 analytics read. **`Setting`** is a key/value table; since
Phase 4 its live keys are the per-user coach cache (`reviewAnalysis:<userId>`). The old `ownerChatId`
key is legacy — identity is the `User.telegramChatId` now, not a Setting (see Multi-user above).

Completing a **commitment** does not close it: it sets `lastDoneAt = now`, clears `lastNudgedAt` /
`promisedAt`, bumps `cycleStreak`, and leaves `status = open` so it resurfaces one cadence later.
`retire` is the explicit "end it for good" path (`status = retired`). Tasks still close on done.

**Type is derived, not chosen** ([src/lib/rank.ts](src/lib/rank.ts)). `deriveType(deadline, cadence)`
is the single rule: a cadence makes it a `commitment`, a one-off deadline a `task`, neither a
`parking` item. The date is the only lever — every create/update path (classifier, board, Telegram
commands) recomputes type from the resulting deadline+cadence rather than trusting any typed value,
so an undated, non-recurring item falls to parking by definition. The classifier sets a deadline or a
cadence to shape an item; it never decides the type directly.

**Ranking is the core IP** ([src/lib/rank.ts](src/lib/rank.ts)). Order is strictly
**date first, importance second**: `compareActionable` sorts by the item's effective due date
(soonest, or most overdue, first) and only uses `important` to break a tie between items due the
**same calendar day** (HKT). There is no blended score — a nearer deadline always wins outright, so
"due tomorrow" beats an important "due next week". A
commitment's due date is **computed, not stored**: `commitmentDue` adds one cadence period to
`lastDoneAt` (or `createdAt`) calendar-accurately — weekly = same weekday, monthly = same
day-of-month clamped to the month's length (31 Jan → 28 Feb), and that computed date is what the
sort uses for commitments. `heatOf` buckets an item into
`burning` / `soon` / `later` (a commitment is `burning` once now ≥ its due date, `soon` within a
cadence-sized lead); `daysOverdue` and `isCritical` (a commitment a full extra period past due) drive
escalation; `promisedToday` flags a broken same-day promise. `commitmentDueLabel` renders the
computed date ("due 19 Jul · 3d overdue") for the board and nudge, so "on fire" always shows a reason.
All day boundaries use `startOfDayHKT`. Parking items are excluded. No quadrants, no score — the
date decides order. The board and both nudge slots consume `rankActionable`.

**Classification / intent routing** ([src/lib/classify.ts](src/lib/classify.ts)) — `interpret` is one
Claude call with a forced `route` tool that turns a messy sentence into an `Intent`: an `action`
(`create | update | complete | snooze | retire | query | clarify`), an optional target `itemId`
resolved against the open list by fuzzy title match, and (for updates) the masked fields to change.
Ambiguous edits return `clarify` with a single question instead of guessing. The system prompt
encodes Jules-specific rules (which referee for what, the six categories, and the "death zone": an
important item with no date falls to parking and rots, so anything important should get a deadline). The model is pinned in [src/lib/anthropic.ts](src/lib/anthropic.ts): Haiku is the only
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
**Voice notes** are a second input: a message with no text but a `voice.file_id` is downloaded and
transcribed by `transcribeVoice` ([src/lib/voice.ts](src/lib/voice.ts)) via OpenAI Whisper
(`whisper-1`, the only non-Anthropic model call, keyed by `OPENAI_API_KEY`), the transcript is echoed
back (`🎙️ Heard: "…"`) so a bad transcription is visible, then fed into the exact same `interpret`
path — so every create/update/snooze flow works by voice with no downstream change.
Auth: the `x-telegram-bot-api-secret-token` header vs `TELEGRAM_WEBHOOK_SECRET` proves the request came
from Telegram; then `resolveUser(chatId)` maps the chat to its user and **all queries scope to that
`userId`** (Phase 4 — the old `ensureOwner` single-owner lock is gone; signup is open). Always returns
200 (even on internal error) so Telegram doesn't retry. New command: `/board` mints a one-time
Telegram-link login.

**Nudge engine** — `buildDailyNudge(items, now, slot)` in [src/lib/nudge.ts](src/lib/nudge.ts) is
pure (items → text + keyboard + topId) and imports no DB/Telegram, so it's unit-tested directly.
`runSweep(slot)` in [src/lib/sweep.ts](src/lib/sweep.ts) is the side-effecting wrapper the cron
calls: it reads the DB, sends the message, and writes accountability memory (bumps `nudgeCount`,
bumps `ignoreCount` when it re-nudges an item that's still open, appends a `nudged` Event). Two
slots, and **both stay silent when nothing is pressing** — there is no empty-state "clean slate"
ping, since a notification on a quiet day just teaches you to swipe the bot away unread (the win
moves to the weekly receipts, M3). When something *is* pressing, pressure has three tiers — `calm` (Done + a row of
snooze presets: tonight/tomorrow/weekend/next week, see [src/lib/snooze.ts](src/lib/snooze.ts)),
`push` (burning: Done / I'll-do-it-today / Tell referee), `escalate` (task 3+ days overdue or
commitment past 2 cadence cycles: referee button goes *first*, copy turns blunt). If you tapped
"I'll do it today" and it's still open that evening, the evening nudge leads with a broken-promise
line. The "Tell <referee>" button is a `wa.me` deep link ([src/lib/waLink.ts](src/lib/waLink.ts),
which rejects numbers under 8 digits so a placeholder can't render a dead link) with a pre-drafted
message. Escalation is always one-tap, never auto-sent. Keep `buildDailyNudge` pure — that's what
`preview-nudge.ts` relies on.

**Referee escalation (M2, the moat)** — the one thing a free to-do app can't copy: a real
consequence with a real person. The pure ladder is `escalationStep` in
[src/lib/escalate.ts](src/lib/escalate.ts), returning `none | warn | send`: an item that is
`important` **and** `isCritical` **and** has an **opted-in** referee gets warned once ("tap it, or next
time I message your wife myself"), then auto-sent on the next sweep. Hard guards: at most **one
auto-send per cycle** (a `told_referee` Event after the cycle anchor blocks re-sends; for commitments
the anchor is `lastDoneAt`, so honoring a cycle resets the ladder), only `important` items, only an
opted-in referee — no referee means the copy still escalates but nothing sends. `runSweep` resolves the
rung (`escalationFor`, the only impure part: it reads the `Event` table for prior `escalation_warned` /
`told_referee`), folds the warning into the same nudge, and on `send` calls `sendToReferee`. The send
channel is the **Meta WhatsApp Cloud API** ([src/lib/referee.ts](src/lib/referee.ts)) — a server can't
send a `wa.me` link, so real auto-send needs a channel it controls. It posts an approved **template**
(business-initiated WhatsApp must be a template, not free text) with two vars (owner name, item title);
`renderEscalation` mirrors the template body so the owner sees exactly what went out. A referee is
**opted in** when their per-user `Referee` row has a real `contact` and `consent = true` (Phase 4 — the
old `<LABEL>_WHATSAPP` / `<LABEL>_CONSENT` env vars are gone); auto-send also needs the shared channel
creds `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_TEMPLATE`. **When the channel isn't configured the
`send` rung degrades to the existing one-tap `wa.me` draft** (already on the escalate keyboard) and
tells the owner, rather than going silent or lying. Escalation is logged at every step, never silent.

**Referee link (M2b)** — a referee holds you accountable without an account. `createRefereeToken` /
`verifyRefereeToken` ([src/lib/auth.ts](src/lib/auth.ts)) sign the referee label into a 90-day HMAC
token (same Web Crypto path as the session token; three dot-parts vs the session's two keeps them
distinct, keyed by `APP_SECRET`). The page
[src/app/referee/[token]/page.tsx](src/app/referee/[token]/page.tsx) shows **only that referee's
overdue items** and a **"Poke {owner}"** button — a server action that re-verifies the token, pings the
owner's Telegram, and logs a `poked` Event. Mint and forward a link by texting the bot
`reflink <wife|sister|colleague>`. The board middleware **excludes `/referee`** (the token is the auth,
the board password isn't involved). New `Event` kinds: `escalation_warned`, `told_referee`, `poked`.

**Cron** ([src/app/api/cron/route.ts](src/app/api/cron/route.ts)) — GET guarded by
`Bearer ${CRON_SECRET}`, **fail-closed** (a missing `CRON_SECRET` returns 401, never runs open), and
the response is just safe counters (`{ sent, users }` — how many users got a nudge, out of how many),
no chat ids. Reads `?slot=evening` (defaults to morning). Two jobs in
[vercel.json](vercel.json): `0 1 * * *` (09:00 HKT, morning) and `0 13 * * *` (21:00 HKT, evening).
Two once-daily jobs fit the Vercel Hobby limit. `vercel.json` also pins **`regions: ["icn1"]`**
(Seoul) so every serverless function runs in the same region as the Supabase DB (`ap-northeast-2`);
without it Vercel defaults to US-East and each DB round trip crosses the Pacific (the board fires
several per interaction) — that was the main source of board lag.

**Web board** ([src/app/page.tsx](src/app/page.tsx)) — a server component and a real control surface;
mutations go through server actions in [src/app/actions.ts](src/app/actions.ts) (`markDone`, `retire`,
`remove`, `updateItem`, `createItem`). Layout top to bottom: a **top bar** — a
`1fr/auto/1fr` grid with the Ember logo left, the **streak chip** (a flame emoji + day count)
dead-center, and on the right a single **Review** nav button next to a circular **"+" add button**
([src/app/AddItem.tsx](src/app/AddItem.tsx), matched to the chip's 32px height). The "+" and Review
buttons are neutral grey, so the only warm chrome is the streak; red is reserved for urgency in the
content. The board is a second create surface alongside Telegram: "+" opens a modal with the same
levers as the edit panel (title, category, referee, deadline, repeats) and calls `createItem`, which
mirrors the Telegram create path — `deriveType` from deadline+cadence, `important` defaults true.
There is **no category filter** (category is just a quiet dot per row); the board goes straight from
the top bar to the burning **hero** (`#1`) on its own card, then the rest as **separate, neutral band
cards** — "On fire"
(always shown) / "Heating up" (open by default) / "Back burner" (collapsed) / "Parking
lot" (collapsed), the collapsible ones a `<details>` with its count. The visual system is **one
color, one job**: category is a quiet colored dot, the single loud color is urgency via `dueTone`
(red = due today/tomorrow/overdue, amber = 2–3 days, neutral beyond) shown on the due text and a red
left-bar on `tone-burning` rows; a row that is **strictly past due** (`daysOverdue > 0`) also fills
light red (`.overdue`) so overdue items jump out, not just the thin bar. Green means Done only, and bands are plain white (only the header
label carries the urgency tint). The hero is the exception: it fills red when burning and takes an
amber/faint left edge by `heatOf` otherwise. Every band (hero, "On fire", and the calm
"Heating up" / "Back burner") uses the one `compareActionable` order — soonest due date first,
importance breaking ties on the same day; `sortByDate` is just that comparator applied to a band. Parking
rows show their age via `parkingAgeLabel` ("added 12d ago") and, once `isStaleParking` trips at **7
days**, a blunt "Decide: date it or drop it" flag. Category renders as a colored dot + grey label; task deadlines render via `dueInLabel` ("due
in 10 days", in days even past a week) and commitments show their computed due date the same way
(`dueInLabel(commitmentDue(...))`). Repeated dodges surface as one steady amber ⚠ via `deferState`
(shown from the first push, same style at any count; the exact tally lives in the tooltip — the
old orange/red/pulsing tiers were collapsed to one marker), placed inline at the end of the title
row so the meta line below stays short. **Tap a row or the hero body to edit** — the edit panel
([src/app/EditTrigger.tsx](src/app/EditTrigger.tsx), a client component) opens on the body click, so
there is no edit button. The panel exposes only the levers you actually control — title, category,
referee, deadline, and a **"Repeats"** select (none / daily / weekly / monthly = the cadence). Type
and `important` are deliberately absent: type is derived from deadline+repeats and `important` is
brain-owned, so neither is clickable. The destructive action sits behind a tap-to-confirm (delete
when there's no cadence, retire for a commitment). Rows and the hero otherwise show only the done
tick; quick-snooze was removed from the board, so deferring happens through Telegram (the nudge's
snooze presets) or by editing the date. There is no promote button and no parking type option:
giving an item a **deadline** in the panel
derives it into a task, clearing the deadline drops it back to parking, and setting "Repeats" makes
it a commitment — all via `deriveType` in `updateItem`. Branded **Ember** — favicon at
[src/app/icon.png](src/app/icon.png), logo on the login screen. Protected by
[src/middleware.ts](src/middleware.ts): the `app_auth` cookie is **not** the password — it holds a
signed, 30-day-expiring HMAC token ([src/lib/auth.ts](src/lib/auth.ts), Web Crypto so it runs on the
Edge) that **carries the `userId`** (Phase 4); the middleware verifies it in constant time and the
board scopes to that user via `currentUser()`. Sessions come from either the Telegram-link login
(`/board` → `/login/<token>`) or the `APP_SECRET` password (`/api/login`, the owner fast path → user 1);
rotating `APP_SECRET` invalidates every outstanding session. The matcher leaves `/login` (now only the
`/login/<token>` route handler, the page is gone), `/api`, `/referee`, `/landing`, `/get-started`, `_next`,
and any path with a file extension open (the last so static assets like `/logo.png` aren't redirected). A
logged-out board hit **redirects to `/get-started`**, not a login page.
Styling is a light, card-based theme in [src/app/globals.css](src/app/globals.css). A calm skeleton
([src/app/loading.tsx](src/app/loading.tsx)) covers a navigation (e.g. opening Review) during the
dynamic re-render, which shows mainly on a cold serverless start.

**Public funnel (landing + get-started, the only two unauthenticated pages).** `/` is the gated board;
the marketing surface lives at **`/landing`** ([src/app/Landing.tsx](src/app/Landing.tsx)) and the
onboarding at **`/get-started`** ([src/app/get-started/page.tsx](src/app/get-started/page.tsx)), both
public via the middleware matcher. The landing extends the board's tokens + flame gradient (the wordmark
is gradient text like the admin header): a soft hero wash, an end-to-end **`HeroFlow`** demo
([src/app/LandingDemo.tsx](src/app/LandingDemo.tsx)) that loops the whole product in one phone — type the
bot → real echo line → ranked board → overdue/red → referee escalation (delivered/read) → burn-to-ash
(reusing the board's `.igniting` + `#ember-fire` filter) — then a how-it-works box with three light,
scroll-revealed (`Reveal`, IntersectionObserver) step cards, a "why vs a notes app" trio with hover
highlight, and CTAs to `/get-started`. **Telegram is the identity, so there is no web signup and no
per-user password**: get-started is a 3-step handoff (get Telegram, even via Telegram Web with no install
/ open the bot + send the first task / send `/board` and tap the link it replies with). The owner
`APP_SECRET` shortcut sits behind a disclosure there; failed `/api/login` and bad `/login/<token>` both
redirect to `/get-started?error=1`. The CTA deep-link reads `TELEGRAM_BOT_URL` (falls back to
telegram.org if unset — set it in Vercel). All landing styles are `.lp-*` / `.gs-*` in globals.css,
reduced-motion safe; HeroFlow + Reveal are the only client islands.

**Burn-to-ash completion** ([src/app/BurnButton.tsx](src/app/BurnButton.tsx)) — the reward half of
the action→reward loop. The Done control on the hero and every row is `BurnButton`, a client island:
on tap it adds `.igniting` to the nearest `[data-burnable]` card, waits `BURN_MS`, then calls
`markDone`. The animation (in [globals.css](src/app/globals.css)) sweeps a flame front left to right:
the card is erased by animating **`mask-position`** (a fixed transparent→black gradient, 3× the card
wide, slid across so black=visible turns to transparent=ash), and two flame bands ride the front by
animating **`transform: translateX`** (with a small `translateY` bob) under an **opacity shimmer** —
all compositor-only. **The motion lives on `mask-position`/`transform`/`opacity` for a reason: keep it
off the main thread.** Two earlier per-frame costs were stripped: (1) a registered `@property` animated
inside the mask/gradient `calc()` — desktop Chrome repainted it each frame but mobile (iOS Safari,
Android Chrome) didn't, so the flames never showed and the row just blinked out; (2) the `#ember-fire`
SVG fractal-noise filter was animated via SMIL (`<animate>` on `baseFrequency`/`scale`), regenerating
the whole noise field every frame on the CPU — that was the visible lag. The filter is now **static**
(baked once for a torn edge) and decorative; if a browser drops it the bands still read as fire, and
the flicker comes from the opacity/transform, not the filter.

When the burn ends, `BurnButton` adds **`.burned`** (`display:none`) to the card *before* calling
`markDone`, so the spent row leaves layout on the client at once. This kills a real lag: a collapsed
(`max-height:0`) row in a flex-`gap` column still holds its surrounding gap open, and that remnant only
closed when `revalidatePath` re-rendered the board and React unmounted the node — on a slow/cold render
you'd watch the card collapse, pause, then the gap snap shut. **`BURN_MS` now sits just *past* the CSS
total** (sweep + fall) so the card is fully collapsed before it's hidden. Because `.burned` is added
imperatively, **every `[data-burnable]` surface must be keyed by item id**: rows already are, and the
hero is now `key={hero.item.id}`. Without it React reuses the single hero slot, and when the next hero
shares the same `heat` the `className` prop is unchanged so React never clears the stale `.burned` —
the promoted hero renders invisible (a bug that shipped and got fixed here). `prefers-reduced-motion`
skips the whole thing and completes instantly. Commitments burn too — honoring one moves it out of the
burning slot anyway.

**Streak** ([src/lib/streak.ts](src/lib/streak.ts)) — the retention hook, shown as the top-bar chip.
`currentStreak(items, dones, now)` counts consecutive days (HKT) ending today on which you cleared
what came due. The rule is **follow-through, not activity**: a day breaks the streak only if a task or
commitment fell due that day (`deadline` day, or `commitmentDue` day) and no `done` Event landed that
day; days with nothing due never break it, so a quiet stretch carries forward. Today is in progress,
so it can only add. Reads the append-only `done` Events and every item's due date, so the board fetches
the full table (not just open) for it — one batched `prisma.$transaction([items, doneEvents])`, with
the open list derived from `allItems` in memory instead of a separate query. No DB column — it's derived
each render.

**Review page** ([src/app/review/page.tsx](src/app/review/page.tsx)) — the second surface, reached by
the board's **Review** button (the Review page has a **Tasks** button back). It reads your week back
instead of listing what to do, and leans on three pure modules:

- **Triage** ([src/lib/triage.ts](src/lib/triage.ts)) — `triage(items, events, now)` drops each open
  item into the single most severe **slipping** bucket it qualifies for, hottest first: `escalated` (a
  `told_referee` Event landed this cycle, so a real consequence is live), `dodging` (`deferCount ≥ 1`),
  `death_zone` (parked past the stale threshold, `isStaleParking` = 7 days). One bucket per item; the
  coach reads the same list.
- **Receipts** ([src/lib/receipts.ts](src/lib/receipts.ts)) — `weeklyReceipts` returns the pure weekly
  numbers (cleared / pushed this week vs last, plus the streak) over the `Event` log, trailing 7 HKT days.
- **Coach** ([src/lib/coach.ts](src/lib/coach.ts) + [src/lib/reviewAnalysis.ts](src/lib/reviewAnalysis.ts))
  — "Your read", the headline value: one Haiku call grounded in the real slipping items + week, returning
  three beats — `pattern` (the habit, item by title), `soWhat` (what to change), `doThis` (one move, one
  sentence). The prompt is held to the anti-AI voice spec (no banned words, no negative-parallelism
  reframes). Cached per-user in `Setting` key `reviewAnalysis:<userId>` with a **7-day staleness window**.
  The page **never blocks on the model**: `readCachedAnalysis` returns whatever is cached (fresh or stale)
  plus a `stale` flag, so the page renders instantly; when stale or missing it schedules `forceAnalysis`
  via Next's `after()`, so the Haiku call runs after the response is sent (the next visit shows the fresh
  read) instead of sitting in the request's critical path — that blocking call was what made opening Review
  feel slow. The **Refresh button** (server action `refreshAnalysis`) still forces a fresh one on demand. So
  a model call happens at most once a week per user from page loads, plus any manual refreshes — never per visit. The scoreboard numbers
  are pure DB math, recomputed live every load at no token cost. Degrades to no card on API failure; an
  old-shape cache regenerates.

The page renders, top to bottom ([src/app/review/ReviewClient.tsx](src/app/review/ReviewClient.tsx)): a
**scoreboard** of count boxes — 🚨 escalated, ⏰ overdue (a flat count of open items past due, cutting
across buckets), 🔁 keep dodging, 💀 death zone, ✅ cleared this week, 🔥 day streak; a box is calm grey
at zero and only lights up with a count (escalated fills red, the two good boxes go green / gold). Then
the coach card (three beats, the "Do this" one edged red). Then the detail list of slipping items
(escalated / dodging / death zone), each row with a **Tell {referee}** `wa.me` link (escalated only) and
a `BurnButton`; burning a row drops it client-side at once via the `onDone` callback, so its scoreboard
box ticks down in the same beat. Death-zone rows carry the board's red "Decide: date it or drop it" flag.
Mutations on either page revalidate both `/` and `/review`.

**Ops console (back-office, shipped 2026-06-21)** — an internal cost/monitoring surface at **`/admin`**,
gated separately from the board. The foundation is a usage log: every paid external call is wrapped by
`track()` ([src/lib/usage.ts](src/lib/usage.ts)), which times the call and writes one **`ApiUsage`** row
(source `classify|coach|transcribe`, provider, model, `userId`, token counts, `audioSeconds`, a
write-time `costUsd` snapshot, `latencyMs`/`ok`/`errorKind`). Raw tokens are the source of truth;
`costUsd` is computed from a central rate table in [src/lib/pricing.ts](src/lib/pricing.ts) (Haiku
$1/$5 per MTok + cache tiers; Whisper per-second) — an unknown model logs $0, the cue to add its rate.
`track` is **best-effort** (a logging failure never breaks the bot/board/cron) and **skips recording when
`userId` is null**, which keeps `npm run try` and tests side-effect free. The three call sites wrapped:
classify ([classify.ts](src/lib/classify.ts), userId via `ClassifyContext`), coach
([coach.ts](src/lib/coach.ts), userId param), transcribe ([voice.ts](src/lib/voice.ts), userId +
`durationSeconds` from the Telegram voice note). The dashboard ([src/app/admin/page.tsx](src/app/admin/page.tsx),
styled with a CSS module) reads `ApiUsage` with live SQL aggregates (no model calls, always current):
KPI cards (today / this month / all-time cost + token total & cache share, all HKT via
[src/lib/costs.ts](src/lib/costs.ts)), a per-tool breakdown with cost-per-run, provider + token boxes, and
a recent-calls table. **`latencyMs`/`ok`/`errorKind` are logged but unsurfaced** — the seed for the
monitoring panels that come after the cost view.

**Admin auth + brute-force guard** — `/admin` is gated by its own **`ADMIN_SECRET`**, distinct from the
board's `APP_SECRET`: the board login grants no access. [middleware.ts](src/middleware.ts) routes `/admin`
(except `/admin/login`) through `verifyAdminToken`; a correct secret at `/api/admin/login` issues a signed
`admin_auth` cookie (`createAdminToken`/`verifyAdminToken` in [auth.ts](src/lib/auth.ts), domain-separated
`admin` prefix, 30-day HMAC). Login is throttled by a **DB-backed** limiter
([src/lib/ratelimit.ts](src/lib/ratelimit.ts)): each attempt writes a **`LoginAttempt`** row (ip, kind,
success); ≥ 8 failures from an IP in 15 min locks that IP out before the secret is even checked. DB-backed
because serverless instances don't share memory; **fails open** on a DB error so a hiccup can't lock the
owner out (the secret is still the gate). The limiter is generic (`kind` = `admin|board`) but only wired to
admin today.

## Conventions

- The six categories are defined once in `CATEGORIES` in [src/lib/rank.ts](src/lib/rank.ts), each
  with a single-word display `label` (e.g. business → "Build") and a `dot` color (the board renders category
  as a colored dot + grey label). The underlying category keys (`personal`, `finance`, …) are what `classify`
  emits; the labels are display-only. The `Category` union is duplicated in `rank.ts` and
  `classify.ts` — keep them in sync if you add one.
- `.env` is loaded via `node --env-file` in the npm scripts, which does **not** strip inline
  comments. Keep every `# comment` on its own line in `.env`/`.env.example` or it folds into the value.
- Dates from Telegram commands and classify are stored at `09:00 HKT` (`T09:00:00+08:00`); all
  ranking/heat/overdue diffs use calendar-day math in HKT via `startOfDayHKT` (UTC+8, no DST).
- Multi-tenant (Phase 4): every `Item`/`Referee` is scoped by `userId`, and the `User.telegramChatId`
  is the identity. Any new query or mutation must filter by the acting user — `resolveUser` on the bot
  side, `currentUser()` on the board side. Run `npm run check:isolation` after changes that touch data access.
- Any new paid external call (a new model, provider, or call site) must go through `track()` in
  [src/lib/usage.ts](src/lib/usage.ts) so it lands on the `/admin` cost log, and its rate must be added to
  [src/lib/pricing.ts](src/lib/pricing.ts) (an unmissed model silently logs $0). `ADMIN_SECRET` gates
  `/admin` and is separate from `APP_SECRET` — keep it set in `.env` and Vercel.
