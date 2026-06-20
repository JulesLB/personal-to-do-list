# Ember — Product Roadmap

*Owner: Jules · Created 2026-06-20 · Source: the product review in [product-review.html](product-review.html)*

This is the working build order for Ember, re-prioritized through a product lens. It supersedes the
sequencing in [docs/hermes-prd.md](docs/hermes-prd.md). That PRD's Phase 0–1 are already built
(commitments survive completion, the `Event` table, tests, freeform edits, the editable board, snooze
presets, voice). This file decides what comes next and in what order. Where a milestone has deeper
engineering and learning notes, it points back to the matching PRD-number in that doc.

## How to use this file

1. Read the **Status board** below. Find the lowest-numbered milestone that is not `DONE`.
2. Open that milestone, build to its **Definition of done**.
3. When it passes, flip its status to `DONE` here and in the Status board, add a one-line note of what
   shipped, and commit.
4. Next session: same loop. "What was done last" is the last `DONE`; "what's next" is the next one.

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARKED`.

---

## Status board

| # | Milestone | Decision | Eff. | Pri. | Status |
|---|---|---|---|---|---|
| M0a | Remove the empty-state morning ping | Remove | S | P1 | DONE |
| M0b | Collapse the defer warning to one state | Remove | S | P2 | DONE |
| M2 | Close the referee loop *(the moat)* | Improve | L | **P0** | TODO |
| M3 | Weekly receipts | Add | M | P1 | TODO |
| M5 | First-run activation | Improve | M | P1 | TODO |
| M6 | Commit templates | Add | S | P2 | TODO |
| M8 | Deadline-aware nudge timing | Improve | M | P2 | TODO |

**Sequencing logic.** Cut the noise first (M0–M1: three near-free wins that sharpen the signal before
anything new lands), then build the one thing that gives Ember a reason to exist (M2), then prove it
works so people stay (M3), give it teeth (M4), make it learnable for a second person (M5–M6), make the
strategic multi-user bet (M7), and do the deadline-timing work last (M8), as you asked, since it needs a
constraint lifted and delivers the least new value.

> **M2 is the headline.** It sits behind the three small cleanups only because they cost about an hour
> each and de-risk everything after. If you would rather lead with value, pull M2 forward; nothing in
> M0–M1 blocks it.

---

## M0a · Remove the empty-state morning ping

**Decision: Remove · Effort: S · Priority: P1 · Status: DONE**

**Shipped.** `runSweep` now returns `{ sent: 0 }` for both slots when nothing is pressing; the
morning "clean slate" message is gone. The win moves to the weekly receipts (M3).

**Why.** In [src/lib/sweep.ts](src/lib/sweep.ts), the morning slot sends "Nothing pressing. Clean slate."
even when there is nothing due. The evening slot already stays silent when nothing is pressing. A
notification that fires on quiet days teaches the user to swipe the bot away unread, which spends the
exact trust the nudge depends on. The whole value of Ember's nudge is that it only speaks when it matters.

**Requirements.**
- In `runSweep`, when `buildDailyNudge` returns `null`, the morning slot should no longer send the
  "clean slate" message. Match the evening behavior: send nothing, return `{ sent: 0 }`.
- Keep the case where there *is* something to send unchanged.
- Optional: preserve the "clean slate" sentiment by folding it into the weekly receipts (M3) where it
  reads as a win, not as noise. Do not add it back to the daily cron.

**Definition of done.**
- [x] A morning sweep with nothing due sends zero messages.
- [x] A morning sweep with a pressing item is unchanged.
- [x] Existing `nudge.ts` tests still pass; added `tests/sweep.test.ts` covering the silent + pressing paths.

**Touches.** [src/lib/sweep.ts](src/lib/sweep.ts).

---

## M0b · Collapse the defer warning to one state

**Decision: Remove · Effort: S · Priority: P2 · Status: DONE**

**Shipped.** `deferState` now returns just `{ count }` (no tier). The `Pushed` marker renders one
steady amber ⚠ at any count with "Pushed N times" in the tooltip; the tier classes and the
`defer-pulse` keyframes are gone from the CSS. The `deferCount >= 2` nudge line is untouched, and the
deferral mechanic itself is unchanged.

**Why.** `deferState` in [src/lib/rank.ts](src/lib/rank.ts) grades pushes into three tiers
(`low | high | alarm`) rendered as orange, red, and a pulsing red icon, with the `Pushed` component in
[src/app/page.tsx](src/app/page.tsx) and matching `.defer-warn` CSS, plus a nudge line past two pushes in
[src/lib/nudge.ts](src/lib/nudge.ts). The signal worth keeping is "you keep dodging this." The escalating
animated guilt meter around it is a lot of surface for one bit of information, and a tool that nags about
how much it is nagging tips from motivating into punishing.

**Requirements.**
- Keep the count. Drop the tiers and the pulse.
- Simplify `deferState` to return the count (and whether to show it at all), not a `tier`.
- `Pushed` renders a single neutral-to-warning marker with "Pushed N times" in the tooltip. Remove the
  `low/high/alarm` class branching and the pulse keyframes from [globals.css](src/app/globals.css).
- Keep the nudge line that appears once `deferCount >= 2`; that threshold is fine.

**Definition of done.**
- [x] The board shows "Pushed N times" in one consistent style regardless of count.
- [x] No tier classes or pulse animation remain for the defer warning.
- [x] The deferral mechanic (incrementing `deferCount` on snooze and on shoving a deadline later) is
      untouched. Only the presentation changed.

**Touches.** [src/lib/rank.ts](src/lib/rank.ts), [src/app/page.tsx](src/app/page.tsx),
[src/app/globals.css](src/app/globals.css), [src/lib/nudge.ts](src/lib/nudge.ts).

---


## M2 · Close the referee loop  *(the moat)*

**Decision: Improve · Effort: L · Priority: P0 · Status: TODO · Maps to PRD-6, PRD-7**

**Why.** Escalation is Ember's whole reason to exist, and today it is a button that drafts a WhatsApp
message *for you to send to yourself's referee*. In [src/lib/nudge.ts](src/lib/nudge.ts), `buttons()` puts
a `waLink()` tap first on the escalate tier and `escalationDraft()` writes sharp copy, but the referee
never receives anything unless you choose to forward it, and they have no view and no way to push back.
The counterparty in an accountability product is passive and uninformed, so the easiest move is to never
tap. This is the one feature a free to-do app cannot copy. Until it produces a real consequence with a
real person, Ember is a nicer Todoist competing on Todoist's terms.

**Scope note.** This is single-direction: you are accountable to an outside contact who does **not** need
to be an Ember user. It is distinct from M7 (paired accountability), which makes the same loop reciprocal
between two Ember users and needs the auth rebuild. Build M2 first; M7 reuses its plumbing.

Split into two shippable halves.

### M2a · A server-controlled send channel (graduated, real auto-send)
- The honest constraint: `wa.me` links cannot be sent from the server; they need a human to tap. Real
  escalation needs a channel the server controls. Pick one to start:
  - **Telegram-to-referee** if the referee will install the bot. Free, already in your stack, simplest.
  - **Twilio SMS** if they will not. Works to any phone, small per-message cost, no approval.
- Add a `sendToReferee(item, referee)` server function over the chosen channel. It writes a `told_referee`
  Event and notifies the owner ("I told your wife. Here's what I sent.").
- Graduated ladder, reading the `ignoreCount` / defer memory that already exists:
  1. Early touches: keep the one-tap `wa.me` draft (consent-first).
  2. Repeatedly dodged + critical + has a referee: warn first ("Tap it, or tomorrow I send it for you").
  3. One step past the warning: auto-send through the controlled channel, then tell the owner.
- Hard guards: fire at most once per item, only for `important` items, only with an opted-in referee, fully
  logged. Never silent.

### M2b · A referee who can poke back
- A tokenized referee link (no account) showing only the one item they referee that is overdue, with a
  "poke Jules" button that pings the owner's bot.
- Optional opt-in weekly digest to the referee. All referee actions logged as Events.

**Definition of done.**
- [ ] An important item dodged past the warning, with an opted-in referee, triggers exactly one auto-send
      through the server-controlled channel and one owner notification. A `told_referee` Event is written.
- [ ] The same item with no opted-in referee escalates copy but never auto-sends.
- [ ] A referee can open their tokenized link, see the overdue item, and send one poke that reaches the
      owner in Telegram.
- [ ] Every escalation step has an `Event` row.

**Touches.** [src/lib/nudge.ts](src/lib/nudge.ts), [src/lib/sweep.ts](src/lib/sweep.ts),
[src/lib/waLink.ts](src/lib/waLink.ts), a new `sendToReferee` module, a new referee-link route under
`src/app/`, `prisma/schema.prisma` (referee channel + consent fields, or a `Referee` row), tests.

**Reference.** Full ladder, provider trade-offs, and idempotency notes: PRD-6 and PRD-7 in
[docs/hermes-prd.md](docs/hermes-prd.md).

---

## M3 · Weekly receipts

**Decision: Add · Effort: M · Priority: P1 · Status: TODO · Maps to PRD-8, PRD-9**

**Why.** The append-only `Event` table already records `done`, `nudged`, `snoozed`, `promised`. Nothing
reads it back to the user. A nag earns resentment; receipts earn loyalty. The weekly review is the habit
that makes people keep (and pay for) a tool, and it is the single best argument for a subscription. The
data is already being written.

**Requirements.**
- A Sunday digest and a board panel built from the `Event` table and item timestamps: cleared vs. dodged
  this week, longest streak, the item you pushed the most (read `deferCount`), kept-promise rate
  (`promised` Events that became `done` same day).
- Respect the Vercel Hobby two-cron limit: do **not** add a third cron. Fold the weekly digest into the
  evening slot's Sunday run (a Sunday branch in the existing evening sweep).
- Keep the aggregation in a pure, testable module (mirror how `rank.ts` / `nudge.ts` stay pure).
- This is also where M0a's "clean slate" sentiment can live, as a win rather than a daily ping.

**Definition of done.**
- [ ] Sunday evening (HKT) produces a digest: completed, dropped, longest streak, most-pushed item,
      kept-promise rate.
- [ ] A board panel shows the same numbers, this week vs last.
- [ ] The aggregation module has unit tests that reconcile against seed data.
- [ ] No new cron job was added.

**Touches.** [src/lib/sweep.ts](src/lib/sweep.ts) (Sunday branch), a new analytics module,
[src/app/page.tsx](src/app/page.tsx) (panel), tests.

---

## M5 · First-run activation

**Decision: Improve · Effort: M · Priority: P1 · Status: TODO · Maps to PRD-12**

**Why.** `/start` in [src/app/api/telegram/route.ts](src/app/api/telegram/route.ts) returns one dense
paragraph of commands. The mental model (type is derived, the death zone, referees) is never taught; it is
encoded in the classifier prompt and left for the user to infer. For a messaging product the first session
is where most users leave, and a wall of syntax is the opposite of activation. This earns its priority
when a second person touches Ember (so it pairs naturally before M7), but it also makes the strongest part
of the build, the classifier, do the teaching.

**Requirements.**
- Guide the first commitment in three taps: "text me one thing you keep avoiding" → it classifies and
  shows the result → "pick who holds you to it." One captured, referee-attached item is the activation
  event.
- Replace the command-list `/start` with this guided flow. Keep the commands discoverable (a `help`
  command) but off the first screen.
- The classifier system prompt in [src/lib/classify.ts](src/lib/classify.ts) is currently hardcoded to
  Jules. For a real second user this needs per-user context (referees, rules). Minimum here: capture the
  user's referees during onboarding so the first item respects them. Full parameterization is part of M7.

**Definition of done.**
- [ ] A fresh chat is walked to its first captured, referee-attached item without needing to know any
      command syntax.
- [ ] `help` still surfaces the full command list on demand.
- [ ] The first item respects the referees set during onboarding, not a hardcoded set.

**Touches.** [src/app/api/telegram/route.ts](src/app/api/telegram/route.ts),
[src/lib/classify.ts](src/lib/classify.ts), `prisma/schema.prisma` (per-user referee config groundwork).

---

## M6 · Commit templates

**Decision: Add · Effort: S · Priority: P2 · Status: TODO**

**Why.** Activation depends on getting a few real commitments in fast. Today every item is a free-text
round trip to Haiku. Empty-state-to-three-items is where to-do apps live or die, and this is the cheapest
fix for it. Helps the owner too, not only new users.

**Requirements.**
- A handful of one-tap starters on the board with sensible cadence + referee baked in (weekly workout,
  monthly finances review, the call you keep dodging).
- Pure board UI over the existing `createItem` server action. No new model work.

**Definition of done.**
- [ ] The board offers one-tap starters that create a fully-shaped item (deadline or cadence, referee,
      category) via `createItem`.
- [ ] Starters respect `deriveType` the same way the manual create path does.

**Touches.** [src/app/AddItem.tsx](src/app/AddItem.tsx), [src/app/actions.ts](src/app/actions.ts),
[src/app/page.tsx](src/app/page.tsx).

---

## M8 · Deadline-aware nudge timing

**Decision: Improve · Effort: M · Priority: P2 (you moved this last) · Status: TODO · Maps to PRD-18 · Breaks a constraint**

**Why.** Two fixed crons in [vercel.json](vercel.json) fire at 09:00 and 21:00 HKT, and `runSweep` sends
the single top item, so a task set for "today at 3pm" is invisible until the next window and there is no
ping at the actual moment a thing is due. A reminder that ignores the time of the deadline is weaker than
the phone's default clock. You flagged this as the last thing you want to do; it is here at the bottom on
purpose, since it needs a constraint lifted and adds the least new product value relative to M2–M4.

**Constraint being broken: two crons per day.** Vercel Hobby caps you at two scheduled jobs, which is why
nudges are stuck at 09:00 / 21:00. Two real fixes:
- One cron that runs every few minutes against a due-time queue (one job, many checks).
- A small external scheduler (Upstash QStash, a GitHub Action) hitting your endpoint per item.

**Tradeoff:** a bit of queue infrastructure on top of the flat table, or a few dollars a month off Hobby.
In exchange you get "ping me when it is actually due," which is table stakes for any paid reminder product.

**Requirements.**
- Let items carry a target time of day, not just a date stored at 09:00 HKT.
- A mechanism (queue or external scheduler) that can fire close to an item's due time.
- Keep the two daily digests; add deadline-time pings on top, not instead.

**Definition of done.**
- [ ] An item due at a specific time gets a nudge near that time, independent of the 09:00 / 21:00 digests.
- [ ] The two daily digests still work.
- [ ] The scheduling mechanism is documented (which provider, how it is triggered).

**Touches.** [vercel.json](vercel.json), [src/app/api/cron/route.ts](src/app/api/cron/route.ts),
[src/lib/sweep.ts](src/lib/sweep.ts), `prisma/schema.prisma` (time-of-day), new scheduler glue.
