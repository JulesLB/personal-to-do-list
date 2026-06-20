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
`nudged|snoozed|promised|done|...`, `slot`) that Phase 2 escalation and Phase 3 analytics read. **`Setting`** is a key/value table whose
only live key is `ownerChatId` — the single user's Telegram chat. It's set **trust-on-first-use**
(the first chat to message the bot, or `OWNER_CHAT_ID` if set) and then **never overwritten**: the
webhook rejects any other chat, so a stranger who finds the bot can't read the list or hijack where
the cron nudges.

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
Auth is two layers: the `x-telegram-bot-api-secret-token` header vs `TELEGRAM_WEBHOOK_SECRET` proves
the request came from Telegram, then `ensureOwner` locks the bot to the owner chat (see `Setting`
above) — the secret alone doesn't prove *which* user sent the message, so without the owner check any
Telegram user who found the bot would be trusted. A non-owner chat is dropped silently. Always returns
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
`Bearer ${CRON_SECRET}`, **fail-closed** (a missing `CRON_SECRET` returns 401, never runs open), and
the response omits `chatId` so an unauthenticated probe leaks nothing. Reads `?slot=evening` (defaults
to morning). Two jobs in
[vercel.json](vercel.json): `0 1 * * *` (09:00 HKT, morning) and `0 13 * * *` (21:00 HKT, evening).
Two once-daily jobs fit the Vercel Hobby limit.

**Web board** ([src/app/page.tsx](src/app/page.tsx)) — a server component and a real control surface;
mutations go through server actions in [src/app/actions.ts](src/app/actions.ts) (`markDone`, `retire`,
`remove`, `updateItem`, `snoozeItem`, `createItem`). Layout top to bottom: a **top bar** — a
`1fr/auto/1fr` grid with the Ember logo left, the **streak chip** dead-center, and a circular **"+"
add button** right ([src/app/AddItem.tsx](src/app/AddItem.tsx), matched to the chip's 32px height).
The board is a second create surface alongside Telegram: "+" opens a modal with the same levers as the
edit panel (title, category, referee, deadline, repeats) and calls `createItem`, which mirrors the
Telegram create path — `deriveType` from deadline+cadence, `important` defaults true. Then a
**sticky** filter bar of the six
categories as **equal-width chips** (a colored dot, the label, the open count), then the burning
**hero** (`#1`) on its own card, then the rest as **separate, neutral band cards** — "On fire"
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
rows show their age via `parkingAgeLabel` ("added 12d ago") and, once `isStaleParking` trips at 14
days, a blunt "Decide: date it or drop it" flag. Clicking a chip sets `?cat=<key>` and
filters the hero + bands; the chip counts stay global; clicking the active chip clears the filter
(there is no logo/reset control). The page reads the filter from the awaited `searchParams` (Next 15
async). Category renders as a colored dot + grey label; task deadlines render via `dueInLabel` ("due
in 10 days", in days even past a week) and commitments show their computed due date the same way
(`dueInLabel(commitmentDue(...))`). Repeated dodges surface as one escalating ⚠ via `deferState`
(orange at 1 push, red at 2, red + pulse at 3+). **Tap a row or the hero body to edit** — the edit panel
([src/app/EditTrigger.tsx](src/app/EditTrigger.tsx), a client component) opens on the body click, so
there is no edit button. The panel exposes only the levers you actually control — title, category,
referee, deadline, and a **"Repeats"** select (none / daily / weekly / monthly = the cadence). Type
and `important` are deliberately absent: type is derived from deadline+repeats and `important` is
brain-owned, so neither is clickable. The destructive action sits behind a tap-to-confirm (delete
when there's no cadence, retire for a commitment). Rows otherwise show only the done tick; the
**snooze-preset menu** ([src/app/SnoozeMenu.tsx](src/app/SnoozeMenu.tsx)) lives on the hero alone.
There is no promote button and no parking type option: giving an item a **deadline** in the panel
derives it into a task, clearing the deadline drops it back to parking, and setting "Repeats" makes
it a commitment — all via `deriveType` in `updateItem`. Branded **Ember** — favicon at
[src/app/icon.png](src/app/icon.png), logo on the login screen. Protected by
[src/middleware.ts](src/middleware.ts): the `app_auth` cookie is **not** the password — it holds a
signed, 30-day-expiring HMAC token ([src/lib/auth.ts](src/lib/auth.ts), Web Crypto so it runs on the
Edge), which the middleware verifies in constant time. `/api/login` checks the typed key against
`APP_SECRET` (constant-time) and issues the token in a `secure` cookie; rotating `APP_SECRET`
invalidates every outstanding session. The matcher leaves `/login`, `/api`, `_next`, and any path with
a file extension open (the last so static assets like `/logo.png` aren't redirected to `/login`).
Styling is a light, card-based theme in [src/app/globals.css](src/app/globals.css).

**Burn-to-ash completion** ([src/app/BurnButton.tsx](src/app/BurnButton.tsx)) — the reward half of
the action→reward loop. The Done control on the hero and every row is `BurnButton`, a client island:
on tap it adds `.igniting` to the nearest `[data-burnable]` card, waits `BURN_MS`, then calls
`markDone`. The animation (in [globals.css](src/app/globals.css)) sweeps a flame front left to right:
the card is erased by animating **`mask-position`** (a fixed transparent→black gradient, 3× the card
wide, slid across so black=visible turns to transparent=ash), and two flame bands ride the front by
animating **`transform: translateX`**, distorted by an SVG fractal-noise filter (`#ember-fire`,
defined once in `page.tsx`) so the edges lick and flicker. The card burns away, then collapses so the
list closes the gap before the server revalidate drops the row. **The motion lives on
`mask-position`/`transform` for a reason: don't move it back onto a registered `@property` animated
inside the mask/gradient `calc()`.** That earlier version rendered on desktop Chrome but silently
failed on mobile (iOS Safari, Android Chrome don't repaint a mask/background gradient when only a
custom property inside its `calc()` changes), so the flames never showed and the row just blinked out.
The `#ember-fire` filter is now decorative — if a browser drops it the bands still read as fire.
**Keep `BURN_MS` ~50ms under the CSS total** (sweep + fall) so the action fires as the ash finishes;
`prefers-reduced-motion` skips the class and completes instantly. Commitments burn too — honoring one
moves it out of the burning slot anyway.

**Streak** ([src/lib/streak.ts](src/lib/streak.ts)) — the retention hook, shown as the top-bar chip.
`currentStreak(items, dones, now)` counts consecutive days (HKT) ending today on which you cleared
what came due. The rule is **follow-through, not activity**: a day breaks the streak only if a task or
commitment fell due that day (`deadline` day, or `commitmentDue` day) and no `done` Event landed that
day; days with nothing due never break it, so a quiet stretch carries forward. Today is in progress,
so it can only add. Reads the append-only `done` Events and every item's due date, so the board fetches
the full table (not just open) for it. No DB column — it's derived each render.

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
- Single-user by design: no per-user scoping anywhere. `ownerChatId` in `Setting` is the whole auth model for who gets nudged.
