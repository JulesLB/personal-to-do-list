# Hermes — product requirements and roadmap

*Owner: Jules · Last updated: 2026-06-18 · Status: POC → MVP*

A single-user accountability engine: text a Telegram bot what you commit to, Claude classifies it, a pressure score ranks everything, two daily crons nudge the most pressing task, and ignoring it long enough surfaces a pre-drafted message to a referee. This doc takes the POC to a real daily driver, then opens it to other users.

---

## 1. Where it stands

The POC is a clean expression of a sharp thesis: capture is solved, follow-through isn't, so the code spends its budget on ranking, nagging, and escalation instead of storage. The ranking engine (`src/lib/rank.ts`) and the two-slot nudge with the broken-promise evening jab (`src/lib/nudge.ts`) are genuine product ideas, not filler.

Two things are not features yet. They are the core loop cracking, and they block "daily driver."

### Crack 1 — recurring commitments die on completion
A `commitment` is an ongoing goal ("build the company, monthly"). It's one row with a `cadence`. Tapping ✓ flips `status` to `done` permanently (`telegram/route.ts`, `actions.ts`). So the half of the product built for ongoing goals either vanishes when you honor it or nags forever when you don't. The only way to keep a commitment alive today is to never complete it. That's backwards.

### Crack 2 — the escalation has no memory and no real consequence
The "Tell your wife" button is a one-tap `wa.me` draft you choose to send (`waLink.ts`). Good for consent. But the referee never enters the loop, nothing records that you told them, and `lastNudgedAt` is overwritten each cron so there's no count of how many times you ignored an item. Escalation tiers fire on deadline math, not on "you've dodged this four times." Accountability with no memory of being ignored and no consequence is a louder reminder, not teeth.

Everything in Phase 0 exists to close these two cracks. Everything after builds on the memory they introduce.

---

## 2. Decisions that frame this roadmap

| Question | Decision | Consequence |
|---|---|---|
| What must the MVP prove? | It's a real daily driver that changes Jules's follow-through. | Optimize for trust and a working loop before reach or polish. |
| How hard does escalation go? | Graduated and earned: one-tap early, auto-send only after repeated *recorded* ignores. | Needs accountability memory (Phase 0) before teeth (Phase 2) can be fair. |
| Single or multi-user? | Single-user now; open to others ~4 weeks out. | Build the loop for one, but isolate the single-user assumptions so Phase 4 is a migration, not a rewrite. |
| Build appetite? | Exhaustive, and a vehicle to learn proper app-building (security, testing, scale). | Engineering concerns are first-class PRDs, each with a learning note. ~14–22 hrs/week. |

---

## 3. Roadmap at a glance

| Phase | Theme | Why now | PRDs | Rough effort |
|---|---|---|---|---|
| **0** | Fix the cracks | A daily driver whose commitments break and whose nags have no memory isn't trustworthy. | 1, 2, 13a | ~2 weeks |
| **1** | Trust and control | You abandon a tool you can't correct. Make every classification fixable. | 3, 4, 5 | ~1.5 weeks |
| **2** | Teeth | With ignore-memory in place, escalation can be earned and finally real. | 6, 7 | ~2 weeks |
| **3** | Scoreboard | Reuse the memory data to prove the loop works and keep you using it. | 8, 9 | ~1.5 weeks |
| **4** | Open the doors | The stated long-term goal. Multi-user is a real migration, gated behind a working loop. | 10, 11, 12, 18 | ~3–4 weeks |
| **5** | Build it properly | You can't expose other people to an untested, unmonitored app. Threads through earlier phases, hardens before launch. | 13, 14, 15, 16, 17 | ongoing |
| **Backlog** | Reach and delight | Real value, but none of it earns a slot before the loop and the doors. | B1–B5 | later |

Sequencing logic in one line: **make the loop honest (0) → make it trustworthy (1) → give it teeth (2) → prove it (3) → share it (4)**, hardening the build the whole way (5).

---

## 4. PRDs

Template: each PRD states the problem, the goal, the requirements, how you'll know it's done, what it depends on, and what you'll learn (since this is also a build-skills exercise).

---

### Phase 0 — fix the cracks

#### PRD-1 · Recurring commitments that survive completion
**Priority: P0 · Effort: M (~6–8h)**

**Problem.** Completing a commitment kills it. Cadence drives nagging but there's no concept of "did it this cycle, reset the clock, resurface next cycle."

**Goal.** A commitment is a standing goal that gets *satisfied per cycle*, not closed forever. Honoring it should reset the pressure and schedule the next surfacing.

**Requirements.**
- Add `lastDoneAt` (DateTime?) to `Item`. For commitments, cadence-overdue math keys off `lastDoneAt` (fallback `createdAt`), not `lastNudgedAt`. Nudging and doing become separate signals.
- Tapping ✓ on a commitment sets `lastDoneAt = now` and keeps `status = open`. It does not set `status = done`.
- Add an explicit "retire commitment" path (Telegram `retire <id>` and a board control) for ending one for good.
- `rankScore` / `heatOf` / `daysOverdue` read `lastDoneAt` for commitments; tasks unchanged.
- Optional: track `cycleStreak` (consecutive cycles honored) for later use by the scoreboard.

**Acceptance criteria.**
- Marking a monthly commitment done today drops it down the ranking, and it climbs back to burning one cadence period later.
- A retired commitment never resurfaces.
- A task's behavior is unchanged.

**Depends on.** None. Do this first.

**What you'll learn.** Modeling recurring/stateful entities in a flat schema, and why "done" is ambiguous for anything that repeats.

---

#### PRD-2 · Accountability memory
**Priority: P0 · Effort: M (~6–8h)**

**Problem.** The system can't tell a brand-new item from one you've dodged five times. `lastNudgedAt` is a single overwritten timestamp. No history means no fair escalation and no scoreboard.

**Goal.** Every nudge, snooze, promise, and completion is recorded. The system knows, per item, how many times it pushed and how many times you bounced it.

**Requirements.**
- Add `nudgeCount` (Int, default 0) and `ignoreCount` (Int, default 0) to `Item`. Increment `nudgeCount` each time an item is the top of a sent nudge. Increment `ignoreCount` when an item that was nudged in the previous slot is still open at the next slot with no action.
- Add a lightweight `Event` table (`id`, `itemId`, `kind` enum: `nudged | snoozed | promised | done | escalated | told_referee`, `slot`, `createdAt`). Append-only. This is the audit trail the scoreboard (Phase 3) and teeth (Phase 2) both read.
- Replace the bare `lastNudgedAt` update in `runSweep` with an event write plus counter bump.
- Keep `buildDailyNudge` pure: it takes the item (now carrying counts) and decides tier; the side effects stay in `runSweep`.

**Acceptance criteria.**
- After three ignored morning nudges, the item shows `ignoreCount >= 2` and an `Event` row exists for each nudge.
- The pure nudge builder can read `ignoreCount` and change copy/tier without any DB call.

**Depends on.** None. Pairs with PRD-1.

**What you'll learn.** Event sourcing basics, append-only audit design, and separating pure decision logic from side effects so it stays testable.

---

#### PRD-13a · Test the engine (start the habit early)
**Priority: P1 · Effort: S (~3–4h)**

**Problem.** `rank.ts` and `nudge.ts` hold the core IP and have zero tests. You're about to change both.

**Goal.** Lock current behavior before refactoring, and establish the testing habit on the easiest, highest-value surface.

**Requirements.**
- Add Vitest. Unit-test the pure functions: `rankScore`, `heatOf`, `daysOverdue`, `isCritical`, `promisedToday`, `buildDailyNudge` across task/commitment/parking and each tier.
- Fixed-clock tests (pass `now` explicitly, which the code already supports) so HKT day-boundary logic is verifiable.
- Wire `npm test` and run it before `npm run build` mentally as the gate.

**Acceptance criteria.** A green suite that fails if ranking order or tier selection changes unexpectedly.

**Depends on.** None; do it alongside PRD-1/2 so the refactor lands on a safety net. Full test strategy is PRD-13.

**What you'll learn.** Unit testing pure functions, fixed-clock testing for time logic, regression safety nets.

---

### Phase 1 — trust and control

#### PRD-3 · Freeform edits in natural language
**Priority: P1 · Effort: M (~6–8h)**

**Problem.** Capture is freeform via Claude, but edits need exact syntax (`due 4 2026-06-20`). You can't fix a wrong category, type, or referee at all. A tool you can't correct in plain language you stop trusting.

**Goal.** "Push the dentist to Friday", "the gym thing is weekly", "that's actually a work item, referee my colleague" all just work.

**Requirements.**
- Extend the classifier into an intent router: a Claude call that decides `create | update | complete | snooze | retire | query` and, for updates, which item and which fields. Resolve the target item by fuzzy title match plus recent context; if ambiguous, ask one clarifying question rather than guessing.
- Forced-tool output as today, but with an `action` discriminator and an optional `itemId`.
- Keep the existing exact commands as fast paths; freeform is the fallback that now also handles mutation, not just creation.
- Echo the change back ("Moved 'dentist' to Fri 20 Jun, marked urgent").

**Acceptance criteria.**
- Five paraphrased edit requests update the right item and fields.
- An ambiguous request ("push it to Friday" with two open items) triggers a single disambiguating question.

**Depends on.** None, but more useful after PRD-4 gives a visual check.

**What you'll learn.** LLM intent routing, tool-use discriminated unions, disambiguation UX, and guarding against confident wrong edits.

---

#### PRD-4 · Editable board (full item control)
**Priority: P1 · Effort: M (~8–10h)**

**Problem.** The board is read-mostly: done and delete-parking only (`page.tsx`, `actions.ts`). You can't fix a misclassification, change a deadline, flip important/urgent, or reassign a referee from the web.

**Goal.** The board is a real control surface. Every field Claude guesses, you can correct in two clicks.

**Requirements.**
- An item detail/edit view (modal or row expand) with title, type, category, important/urgent, deadline (date picker, stored at 09:00 HKT), referee, cadence, snooze.
- Server actions for update and retire alongside the existing done/remove.
- Inline quick actions on each row: snooze menu, mark done, edit.
- Optimistic UI or `revalidatePath` as today; keep it a server component where possible.

**Acceptance criteria.** Any field set by classification can be changed from the board and persists; the ranking reorders immediately.

**Depends on.** Reuses the snooze options from PRD-5.

**What you'll learn.** Next.js server actions for mutation, form state, controlled inputs, and date handling across timezones in the UI.

---

#### PRD-5 · Smarter snooze and parking promotion
**Priority: P2 · Effort: S (~3–4h)**

**Problem.** The only snooze is "1 day" from a button. Parking items can't graduate to real tasks.

**Goal.** Defer with intent ("this weekend", "next week", a specific date) and promote a parked idea into an actionable task.

**Requirements.**
- Snooze presets: tonight, tomorrow, this weekend (next Sat 09:00 HKT), next week (next Mon), custom date. Compute boundaries in HKT.
- A "promote" action that converts a `parking` item to a `task` and runs it back through classify (or asks for a deadline/referee).
- Expose presets in both Telegram inline buttons and the board.

**Acceptance criteria.** "Snooze to this weekend" on a Wednesday resurfaces Saturday morning HKT; a promoted parking item enters the ranked list with teeth.

**Depends on.** PRD-4 for the board surface.

**What you'll learn.** Calendar math in a fixed-offset timezone, and progressive disclosure in a constrained UI (Telegram buttons).

---

### Phase 2 — teeth

#### PRD-6 · Graduated escalation with real auto-send
**Priority: P1 · Effort: L (~10–14h)**

**Problem.** Escalation never reaches the referee unless you tap, and you can ignore the tap. There's no actual consequence. (Now fixable because PRD-2 gives ignore-counts.)

**Goal.** A fair, escalating ladder where the social cost becomes real if and only if you've repeatedly, demonstrably dodged something that matters.

**Recommended ladder (my call, per your delegation).**
1. **Touches 1–2 ignored** — normal push tier: Done / I'll-do-it-today / optional one-tap Tell.
2. **Touch 3+, or task 3+ days overdue, or commitment 2 cycles overdue** — escalate tier: referee button first, blunt copy, plus an explicit warning: *"Tap it, or tomorrow I send it for you."*
3. **Touch 5+ (or the day after the warning) on a critical item that has a referee** — **auto-send** the message through a channel the server controls, then tell you: *"I told your wife. Here's what I sent."* One armed item at a time; never silent.

**The honest infrastructure note.** `wa.me` links cannot be sent server-side; they need a human to tap and open WhatsApp. Real auto-send needs a channel you control. Options:
- **Twilio SMS** — simplest, works to any phone, small per-message cost, no approval. *Recommended starting point.*
- **WhatsApp Cloud API (Meta) or Twilio WhatsApp** — on-brand channel, but template approval and a business number. Phase 2b once SMS proves the loop.
- **Telegram to the referee** — free, but the referee must install the bot. Good for a referee who's technical.

Recommendation: ship the ladder with **Twilio SMS** as the auto-send channel, keep `wa.me` one-tap for the early touches, and gate auto-send behind an explicit per-referee opt-in you set once.

**Requirements.**
- Tier selection reads `ignoreCount` and the existing critical math together.
- A `referee` consent flag and channel (phone for SMS) in config (Phase 4: per-user table).
- `sendToReferee(item, referee)` server function with the chosen provider; writes a `told_referee` Event and notifies the owner.
- A hard guard: auto-send fires at most once per item, only for `important` items, only with a configured + opted-in referee, and is fully logged.

**Acceptance criteria.**
- An important task ignored five times with an opted-in referee triggers exactly one auto-send and one owner notification.
- The same item without an opted-in referee escalates copy but never auto-sends.
- Every escalation step has an `Event` row.

**Depends on.** PRD-2 (ignore memory), referee config from PRD-12 in multi-user.

**What you'll learn.** Third-party messaging APIs, idempotency and "fire at most once" guards, consent gating, and designing a system that takes a consequential action on your behalf without misfiring.

---

#### PRD-7 · Referee loop (optional, higher-touch)
**Priority: P3 · Effort: L (~10–12h)**

**Problem.** Even with auto-send, the referee is a passive recipient. Real accountability has the other person able to poke back.

**Goal.** The referee can confirm they're holding you to it, or fire a "did you do it?" back at you, and gets an optional weekly digest of what you committed to and dropped.

**Requirements.**
- A minimal referee surface: a tokenized link (no full account) showing the items they referee for you, with a "nudge Jules" button that pings your bot.
- Optional weekly digest to the referee (opt-in, respects the consent flag).
- All referee actions logged as Events.

**Acceptance criteria.** A referee can send one nudge that reaches you in Telegram; the weekly digest sends only with opt-in.

**Depends on.** PRD-6, and the multi-user data model (PRD-10) if referees become accounts.

**What you'll learn.** Tokenized capability links (access without accounts), and designing for a second human in the loop.

---

### Phase 3 — scoreboard

#### PRD-8 · Follow-through analytics
**Priority: P2 · Effort: M (~6–8h)**

**Problem.** The product's whole claim is "improves follow-through," and nothing measures it. You can't tell if it's working.

**Goal.** A simple scoreboard that turns the Event log into proof: completion rate, average days-to-done, ignore rate, current streaks.

**Requirements.**
- Metrics computed from the `Event` table and `Item` timestamps: % of items completed vs dropped, median time from create to done, % of nudges ignored, commitment cycle streaks.
- A board section (and a Telegram `stats` command) showing this week vs last, per category.
- Keep computation in a pure module so it's testable.

**Acceptance criteria.** Numbers reconcile with a hand count on seed data; the view loads in one query pass.

**Depends on.** PRD-2 (the Event log is the source).

**What you'll learn.** Turning an event stream into aggregates, and choosing metrics that actually reflect the goal rather than vanity counts.

---

#### PRD-9 · Weekly review ritual
**Priority: P2 · Effort: S (~4–5h)**

**Problem.** The thesis is follow-through, but there's no reflection moment. Things rot silently in the "show all" drawer.

**Goal.** A Sunday evening digest: what you finished, what you dropped, what's been rotting and needs a decision (do, schedule, or drop).

**Requirements.**
- A third cron slot (`weekly`) or a Sunday branch in the evening cron. Note the Vercel Hobby limit is two crons/day, so fold weekly into the evening slot's Sunday run rather than adding a job.
- Surfaces stale items (open, never actioned, N+ days old) and forces a choice via buttons: schedule, retire, or keep.
- Pulls headline numbers from PRD-8.

**Acceptance criteria.** Sunday 21:00 HKT produces a digest listing completed, dropped, and 3 oldest rotting items, each with action buttons.

**Depends on.** PRD-8 for the numbers.

**What you'll learn.** Working within platform limits (cron quotas), and designing a forcing function rather than a passive report.

---

### Phase 4 — open the doors (multi-user)

> This is the migration phase. The current code assumes one user everywhere: `ownerChatId` is the whole auth model, no row is scoped to a person, referees are env vars. None of that survives contact with a second user. Treat Phase 4 as a deliberate migration, not a sprinkle of `userId` columns.

#### PRD-10 · Multi-user data model
**Priority: P1 (for the multi-user goal) · Effort: L (~12–16h)**

**Problem.** Every `Item` belongs implicitly to Jules. Referees are global env vars. A second user would see and trigger Jules's items.

**Goal.** A `User` entity that owns items, referees, and settings, with strict per-user isolation.

**Requirements.**
- `User` (`id`, `telegramChatId` unique, `email?`, `timezone`, `createdAt`). `Item.userId` FK, not null. `Referee` table (`id`, `userId`, `name`, `relation`, `channel`, `contact`, `consent`) replacing the env-var trio. `Setting` scoped per user or replaced by `User` columns.
- Every query in `nudge.ts`, `route.ts`, `page.tsx`, `actions.ts` filters by `userId`. The cron sweeps all users, sending each their own nudge.
- A migration that backfills Jules as user 1 and re-parents existing items.
- Move off `db push` to versioned Prisma migrations (PRD-17) before this lands.

**Acceptance criteria.** Two seeded users never see or trigger each other's items; the morning cron sends each their own top item; referees are per-user.

**Depends on.** PRD-17 (migrations) strongly recommended first.

**What you'll learn.** Multi-tenancy, row-level data isolation, foreign keys and backfill migrations, and the cost of retrofitting tenancy versus designing for it.

---

#### PRD-11 · Real authentication
**Priority: P1 (multi-user) · Effort: L (~10–14h)**

**Problem.** Board auth is one shared `APP_SECRET` cookie with no expiry, no identity (`middleware.ts`). Fine for one person, unusable for many.

**Goal.** Per-user accounts linked to a Telegram identity, with sessions, not a shared password.

**Requirements.**
- Auth via Telegram login (the bot is already the identity anchor) and/or email magic link. Evaluate NextAuth/Auth.js vs a thin custom session.
- The board reads the session user and scopes to their items.
- Account linking: a user starts the bot, gets a code, links it to a web session.
- Replace the global-secret middleware with session checks; keep `/api/telegram` on its webhook-secret guard.

**Acceptance criteria.** A new user can sign up, link Telegram, and see only their own board; sessions expire and refresh.

**Depends on.** PRD-10.

**What you'll learn.** Auth flows (sessions, magic links, OAuth-style linking), the difference between authentication and authorization, and why "a shared secret" is not auth.

---

#### PRD-12 · Onboarding
**Priority: P2 (multi-user) · Effort: M (~6–8h)**

**Problem.** Hermes encodes Jules's referees, categories, and rules in a hardcoded system prompt (`classify.ts`). A new user has none of that.

**Goal.** A short onboarding that captures who the user is, their referees and channels, quiet hours, and timezone, then personalizes the classifier.

**Requirements.**
- Bot- or web-driven onboarding: set name, timezone, referees (name, relation, channel, consent), and optionally tune the category set.
- Inject per-user context (referees, timezone, rules) into the classifier system prompt instead of the hardcoded Jules block.
- Sensible defaults so a user can start in under two minutes.

**Acceptance criteria.** A fresh user completes onboarding and their first captured item respects their referees and timezone, not Jules's.

**Depends on.** PRD-10, PRD-18 (per-user timezones).

**What you'll learn.** Parameterizing a hardcoded prompt into per-user config, and onboarding as activation.

---

#### PRD-18 · Per-user scheduling, timezones, and quiet hours
**Priority: P2 (multi-user) · Effort: M (~6–8h)**

**Problem.** Nudge times are fixed at 09:00/21:00 HKT for everyone, hardcoded in `vercel.json` and `rank.ts`. A user in London gets nagged at 02:00.

**Goal.** Each user is nudged on their own clock, with quiet hours and weekend rules.

**Requirements.**
- Generalize `startOfDayHKT` to `startOfDay(date, tz)`; store each user's IANA timezone. Keep the fixed-offset HKT path as the default.
- The cron runs hourly (or a few times daily within Hobby limits) and sends to users whose local time matches their nudge slot, rather than one global fire.
- Per-user quiet hours and an optional "no weekend nudges" flag.

**Acceptance criteria.** Two users in different timezones each receive their morning nudge at their own 09:00; quiet hours suppress sends.

**Depends on.** PRD-10. Re-checks the Vercel cron quota (may need hourly fan-out).

**What you'll learn.** Correct timezone handling beyond a single fixed offset (DST, IANA zones), and fan-out scheduling under platform constraints.

---

### Phase 5 — build it properly (threads throughout, hardens before launch)

#### PRD-13 · Test strategy
**Priority: P1 · Effort: M (ongoing)**

**Goal.** Beyond the Phase 0 unit tests, integration coverage for the surfaces that touch the DB and external services.

**Requirements.** Integration tests for the Telegram webhook (mock Telegram, real test DB) and the cron sweep; contract tests around the classifier tool schema; a seeded test DB. Target the risky paths: callback parsing, escalation gating, multi-user isolation.

**What you'll learn.** The test pyramid, mocking external services, and testing time- and side-effect-heavy code.

#### PRD-14 · CI/CD
**Priority: P2 · Effort: S**

**Goal.** Every push runs typecheck, tests, and a Prisma validate before Vercel deploys; migrations apply on deploy.

**Requirements.** GitHub Actions: `prisma generate`, `tsc`, `vitest`, `prisma migrate deploy` against a preview DB. Block merge on red.

**What you'll learn.** CI pipelines, deploy gates, and migration-on-deploy discipline.

#### PRD-15 · Observability and error handling
**Priority: P1 · Effort: M**

**Problem.** The webhook swallows every error and always returns 200 (`route.ts`); a failed cron send is invisible. You'd never know the loop broke.

**Goal.** Know when something fails, with enough context to fix it.

**Requirements.** Structured logging, error tracking (Sentry or similar), and a cron health signal: if a sweep finds an owner but fails to send, alert (to the bot itself or email). Keep the always-200 for Telegram, but log the underlying error first.

**What you'll learn.** Observability, error tracking, and the difference between "absorb the error so the webhook doesn't retry" and "hide the error so you never learn."

#### PRD-16 · Security hardening
**Priority: P1 (before multi-user) · Effort: M**

**Goal.** Close the gaps that are tolerable for one trusted user and unacceptable for many.

**Requirements.** Rate-limit the webhook and login; validate and bound all inputs (ids, dates, free text length); rotate and scope secrets; if staying on Supabase, enable row-level security as defense in depth behind app-level scoping; review the auto-send path (PRD-6) for abuse. Add a security review pass before opening to others.

**What you'll learn.** Practical app security: rate limiting, input validation, secrets management, defense in depth, and threat-modeling a feature that sends messages on a user's behalf.

#### PRD-17 · Migration discipline
**Priority: P1 (before multi-user) · Effort: S**

**Problem.** The project uses `prisma db push` with no migration files, and the schema has flipped between SQLite and Postgres. That's fine for a solo POC and dangerous with real user data.

**Goal.** Versioned, reviewable migrations as the only way the production schema changes.

**Requirements.** Adopt `prisma migrate`, commit migration files, run `migrate deploy` in CI/CD (PRD-14). Settle the dev/prod provider story (Postgres everywhere via a local container, or a documented switch).

**What you'll learn.** Schema migration as a first-class, versioned artifact, and why `db push` doesn't scale past one developer.

---

## 5. Backlog (real value, not yet earned)

- **B1 · Voice capture.** Transcribe Telegram voice notes through Whisper-class transcription, then classify. Lowers capture friction further.
- **B2 · Batch nudges.** When several items burn at once, send a single ranked digest with per-item actions instead of only the #1.
- **B3 · Calendar integration.** Two-way Google Calendar: deadlines become events, events with prep become tasks.
- **B4 · Sub-tasks / projects.** Let a big commitment decompose into steps without abandoning the flat-table simplicity everywhere else.
- **B5 · PWA / web push.** A installable board with push notifications as a second nudge channel alongside Telegram.

Each is genuinely useful. None should jump ahead of an honest loop (Phase 0–3) or the multi-user goal (Phase 4).

---

## 6. What this roadmap teaches, mapped to "build a proper app"

| Concern | Where you learn it |
|---|---|
| Data modeling and recurring state | PRD-1, PRD-2 |
| Event sourcing and audit trails | PRD-2, PRD-8 |
| Testing (unit → integration → CI) | PRD-13a, PRD-13, PRD-14 |
| LLM intent routing and tool use | PRD-3 |
| Third-party integrations and idempotency | PRD-6 |
| Multi-tenancy and data isolation | PRD-10, PRD-18 |
| Authentication and authorization | PRD-11 |
| Timezones done right | PRD-18 |
| Observability and error handling | PRD-15 |
| Security and threat modeling | PRD-16 |
| Migration discipline | PRD-17 |

The order is deliberate: you learn each concern at the moment the product actually needs it, which is how it sticks.
