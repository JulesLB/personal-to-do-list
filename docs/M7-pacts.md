# M7 · Pacts (paired accountability)

*Owner: Jules · Created 2026-06-23 · Status: PROPOSED (PRD for sign-off, no code yet)*

This is the M7 "paired accountability" bet from the [ROADMAP](ROADMAP.md), written up in full and
reframed around one sharp idea: a **Pact**. Two people commit to the same recurring thing and witness
each other. It is Ember's first multi-player feature and its first built-in growth loop.

**Decided (2026-06-23, with Jules): Telegram-only for V1.** Both people use the Ember Telegram bot; a
non-Telegram invitee installs Telegram first. We do **not** build a web/email "lite" partner (rejected:
it roughly doubles the build, and an email nudge is a weak poke next to a bot ping). The install step is
made painless by a **framed invite page** (§3b) and a pre-written message that tells the friend to grab
Telegram first. The bet: for the close-tie pacts that are the real use case (family, a close friend),
"install Telegram first" is a fine ask between people who actually know each other.

---

## 1. The one-liner (how we explain it to a human)

> **A habit tracker is a promise you make to yourself. A pact is the same promise, made to someone who
> can see whether you kept it. You keep that one.**

That is the whole pitch. Everything below serves that sentence.

If a user reads one thing on the landing page or in the bot, it is this: *do it with someone, and you
both show up.*

---

## 2. Why this is different from tracking your own habit

The thing we are selling against is not Todoist. It is the solo habit tracker (the streak app, the
notes-app checklist). Here is the honest difference, in the user's terms:

| Solo habit tracking | A pact |
|---|---|
| You tick a box. Nobody knows if you skip. | A real person is doing the same thing and sees if you skip. |
| The streak is between you and a number. | The streak is between you and a friend. |
| Quitting costs you nothing. | Quitting lets someone down. That is the cost. |
| You start it alone, you quit it alone. | You start it together, so quitting is a conversation, not a swipe. |

The mechanism is social, not technical. We are not adding a smarter reminder. We are adding **a witness
who cares**, which is the one thing a number on a screen can never be. That is also why it retains: the
reason to come back is not the app, it is the person.

And it is why it spreads: you cannot make a pact alone. Every pact is one personal invitation to one
friend, sent by the friend, not by us. That is the strongest referral there is.

---

## 3. The user-facing flow (must be ultra simple)

The bar: an inviter sets up a pact in **2 taps**, and an invitee joins in **2 taps with zero typing and
no password**. If any step needs a third tap or a form, it is wrong.

### 3a. Starting a pact (the inviter)

1. Jules has (or creates) a recurring commitment, e.g. *"gym 3x a week."*
2. Ember offers, right there: **"Doing this with someone? → Invite a partner."**
3. He taps. Ember replies with **one link and a ready-to-send message** already written, with the
   install nudge baked in so he doesn't have to phrase it:
   > *"Hey, I'm using Ember to actually stick to gym 3x a week and I want you in, we keep each other
   > honest each week. If you're not on Telegram, grab it first (free), then tap: ember.app/p/abc123"*
4. He forwards that to his sister over whatever he already uses (WhatsApp, iMessage, anything). Done.

He never picks a channel inside Ember, never enters her number. He copies a message and sends it like a
normal text. **The human carries the invite, so Ember never messages a stranger** (this is also why we
need no WhatsApp Business setup, see §7).

### 3b. Joining a pact (the invitee)

The link points at a **framed Ember invite page** (`ember.app/p/<code>`), not the raw Telegram link, so
the first thing the invitee sees is who invited them and to what, on our page, in our words, before
they're anywhere near Telegram.

1. Sister taps the link → the invite page: *"Jules invited you to a pact: gym 3x a week. You'll each
   check in weekly and see each other's streak."* One primary button: **[ Open in Telegram → ]**.
2. **If she has Telegram:** tapping it opens the bot with the pact pre-loaded → *"Jules wants to do gym
   3x a week with you. In?"* → **[ I'm in ]**. The pact is live. Two taps, nothing typed.
3. **If she doesn't have Telegram:** the same page shows, right under the button, *"Don't have Telegram?
   1. Install it (free) · 2. Come back and tap Open."* She installs once, returns, taps Open, lands in
   the bot with the pact still loaded.

She is now an Ember user (her own board, her own bot). No password, no web form. The honest cost is the
one-time install for a non-Telegram invitee. We don't hide it: we make it a clear two-line instruction,
own the framing on our page instead of Telegram's generic fallback, and let the inviter pre-warn them in
the forwarded message. For a close-tie pact, that ask is fine, the relationship carries it.

### 3c. Living with it (both people, every cycle)

- Each cycle, one nudge: *"Gym this week? Jules already ticked his. 🔥 You two: week 3."* → tap done.
- The board shows a **pact card**: the commitment, both people's check for this cycle, and the shared
  streak. One glance tells you where you both stand.
- If your partner is slipping, an optional one-tap **"Nudge Sarah"** sends her a gentle bot message
  (rate-capped, see §6). You are her witness, not her boss.

That is the entire feature surface. A pact is a commitment with a face next to it.

---

## 4. How we introduce it (discovery)

Discovery lands at the moment of relevance, not in onboarding (onboarding is already a careful three-tap
flow from M5; do not overload it).

- **Primary trigger — on creating a recurring commitment.** The moment someone sets a weekly/monthly
  commitment over Telegram or the board, Ember offers once: *"Want someone in on this? Make it a pact."*
  This is the natural beat: they just committed to a recurring thing, which is exactly what a pact is for.
- **Standing entry point — the board.** A commitment row carries a quiet **"+ partner"** affordance, so
  the idea is always reachable without waiting for the prompt.
- **One-time announcement.** Existing users get a single bot message when the feature ships: the §1
  one-liner plus *"reply `pact` to try it."* Shown once, never repeated.

We do **not** push it at first-run. A brand-new user has no habit yet; a pact before the first solo win
is asking for commitment before trust. The prompt waits until they have a recurring commitment worth
sharing.

---

## 5. Functional requirements

### Must have (MVP)
- A user can turn a recurring commitment into a pact and get one shareable invite (link + pre-written
  message, install nudge baked in).
- The invite link opens a **framed Ember page** (`/p/<code>`) that names the inviter and the pact and
  routes to the bot, handling the no-Telegram case with clear install steps (not Telegram's generic
  fallback page).
- An invitee opens the link, lands in the Telegram bot with the pact pre-loaded, and accepts in one tap;
  if they are new, accepting creates their account (same Telegram-link identity as today).
- On accept, each member has their own commitment `Item` for the pact's title + cadence, scoped to their
  own `userId`, ranked and nudged by all existing logic.
- Both members can see, for the shared pact only: the partner's name, the partner's done/not-done state
  for the current cycle, and the **shared streak** (consecutive cycles both cleared).
- The nudge for a pact commitment names the partner and their status.
- A **pending** pact (invite not yet accepted) leaves the inviter's commitment fully working solo; it is
  never dead weight.

### Should have
- A board **pact card** showing both checks and the shared streak at a glance.
- A one-tap **"Nudge {partner}"** action that sends the partner a single bot message, rate-capped.
- **Leave / end** a pact: either side can end it; the other side's commitment reverts to a normal solo
  commitment (it does not vanish).

### Won't have (V1 scope cuts, stated so they're deliberate)
- **Groups of 3+.** Pairs only in V1. Groups multiply the visibility and streak rules; ship pairs first.
- **WhatsApp / SMS delivery of nudges.** All Ember-sent messages go to opted-in users over Telegram. The
  invite travels by the human forwarding a link (see §7).
- **Proof / verification of completion.** Check-in stays self-reported (tap done), same honesty model as
  the rest of Ember. The witness is the deterrent, not a photo.
- **A web signup for the invitee.** Telegram is the identity. No second-class token-only user.

---

## 6. CX guardrails (the friction-layer notes)

- **A flaky partner must not punish you.** Your personal streak stays independent. The pact streak is a
  separate, additive number ("you two: week 3"). If your partner misses, the *pact* streak breaks but
  your *own* record does not. Losing your streak to someone else's miss would be the fastest way to make
  people hate this.
- **"Nudge partner" is a tap on the shoulder, not a cattle prod.** Cap it (e.g. once per partner per
  cycle), keep the copy warm. The pressure in a pact comes from being seen, not from being buzzed.
- **Pending invites expire quietly.** If a partner never joins, the inviter is told once and the
  commitment just keeps working solo. No nagging the inviter about a friend who said no.
- **Ending a pact is graceful and blameless.** Either side can leave; the copy frames it as the pact
  ending, not a person quitting on a person. The surviving commitment carries on solo.

---

## 7. Why this needs no WhatsApp Business setup (the key advantage)

Idea 1 (handing a task to a non-user) was blocked on the Meta WhatsApp Cloud API: business-initiated
messages need approved templates, and broadcasting to many people risks the number's quality rating.
M2 is parked on exactly that setup.

Pacts sidestep it entirely. **Ember only ever sends messages to users who opted in by tapping "I'm in"
on Telegram.** The invite itself is a plain URL that the *human* forwards over their own WhatsApp or
iMessage. No template, no approval, no spam risk, no Meta account. The only friction is getting the
partner onto Telegram, which the one-tap deep link makes about as light as it can be.

This is why M7 is buildable and testable today and M2/Idea 1 is not.

---

## 8. Data model (proposed)

A pact is **two linked commitments plus a thin coordination layer**, to reuse the maximum of what exists.

- **`Pact`** — `id`, `title`, `cadence`, `createdByUserId`, `status` (`pending | active | ended`),
  `createdAt`. The shared definition.
- **`PactMember`** — `pactId`, `userId` (nullable until accepted), `role` (`owner | partner`),
  `inviteCode` (short, random, URL-safe, **≤ 64 chars** so it fits both the `/p/<code>` page URL and
  Telegram's `start` deep-link param; resolved server-side, not a long HMAC), `joinedAt`, `itemId` (FK
  to that member's own commitment `Item`).
- **`Item`** gains an optional **`pactId`** so a commitment knows it belongs to a pact (and the board /
  nudge can render the partner beside it). Additive, nullable, no change to existing items.

Each member's side is a normal commitment `Item` scoped to their `userId`, so `commitmentDue`,
`cycleStreak`, `heatOf`, ranking, the board, and the nudge engine all work unchanged. The only new logic
is the invite/accept flow, the shared-streak calc, and the **one sanctioned cross-`userId` read**: a
member may read their partner's done-state and streak **for that pact only**, nothing else.

> **Isolation note.** Phase 4's invariant is "every query scoped by `userId`," enforced by
> `npm run check:isolation`. Pacts are the first deliberate exception. The cross-read must be a single,
> explicit, narrow path (partner's status on one shared pact), written on purpose and covered by a test,
> not a loosening of the general scoping rule.

---

## 9. Build phases

- **Phase A — invite + accept.** `Pact` / `PactMember` tables, `pactId` on `Item`, the Telegram invite
  link + deep-link accept flow, the "make it a pact" prompt on commitment creation. Outcome: two users
  can be linked on one commitment.
- **Phase B — the loop.** The cross-`userId` partner-status read, the shared-streak calc, the pact card
  on the board, the partner named in the nudge. Outcome: you see each other and it retains.
- **Phase C — social + lifecycle.** The "nudge partner" action, leave/end-pact, pending-invite expiry.
  Outcome: it is humane and complete.

A + B is the shippable MVP. C is the follow-up.

---

## 10. Definition of done

- [ ] An inviter turns a recurring commitment into a pact and gets one link + pre-written message in ≤ 2 taps.
- [ ] An invitee opens the link, lands in the bot with the pact pre-loaded, and accepts in ≤ 2 taps with no
      typing and no password; a new invitee gets an account on accept.
- [ ] After accept, both members have their own scoped commitment `Item` and are nudged by the existing engine.
- [ ] Each member can see the partner's current-cycle status and the shared streak, **and nothing else of
      the partner's data** (verified by an isolation test).
- [ ] The pact nudge names the partner and their status; the board shows a pact card.
- [ ] A flaky partner does not break the other member's personal streak.
- [ ] A pending invite leaves the inviter's commitment working solo; either side can end the pact and the
      survivor reverts to a solo commitment.
- [ ] `npm test` and `npm run build` green; `npm run check:isolation` passes with the one documented pact exception.
- [ ] No WhatsApp / Meta setup required to ship or test.

---

## 11. Decisions (resolved 2026-06-23, with Jules)

1. **Pact streak** = "cycles you both cleared," shown as its own number. Each person's personal streak
   stays independent, so a flaky partner can't break your own record.
2. **Discovery** = prompt once each time you create a recurring commitment ("want someone in on this?"),
   plus a quiet "+ partner" entry point on the board. Not in first-run onboarding.
3. **MVP line** = ship Phase A (invite + accept) and Phase B (the see-each-other loop) as the first
   release; fast-follow with Phase C (nudge-partner, leave/end).

---

## 12. Build plan (engineering)

Branch `feat/m7-pacts` off `main`. Gate every phase on `npm test`, `npm run build`, and
`npm run check:isolation`, same as always.

**Two gotchas that have bitten before, both live here:**
- **The migration hits prod.** `npm run db:migrate` applies to the cloud `DATABASE_URL`. The Pact tables
  and `Item.pactId` are additive + nullable, so prod tolerates them before the code ships, but still
  deploy the matching code in the same beat.
- **Two schemas.** Add the models to BOTH [schema.prisma](../prisma/schema.prisma) and
  [schema.sqlite.prisma](../prisma/schema.sqlite.prisma), or `dev:local` / `try` break.

**On isolation:** the RLS migration only closes the Supabase Data API (the app connects as the table
owner, which bypasses RLS), so per-user scoping is an application-code convention, not a DB wall. The
cross-user pact read is a normal Prisma query; the discipline is keeping it narrow, enforced by extending
`check:isolation`.

### Phase A — invite + accept (the plumbing)
*Outcome: two chats linked on one commitment.*

- **Schema (both files).**
  - `Pact` — `id`, `title`, `cadence`, `status` (`pending | active | ended`), `createdByUserId`, `createdAt`.
  - `PactMember` — `id`, `pactId`, `userId?` (null until accept), `role` (`owner | partner`),
    `inviteCode` (unique, short, URL-safe, ≤ 64 chars; only the partner slot carries one), `joinedAt?`.
  - `Item` gains `pactId Int?` + index. Migration `20260624000000_pacts`.
- **New [src/lib/pact.ts](../src/lib/pact.ts).** `newInviteCode()`; `startPact(item, ownerUserId)`
  (creates the Pact + owner/partner members, stamps `pactId` on the owner's existing item, returns the
  code + the pre-written invite message); `acceptPact(code, userId)` (binds the partner member to the
  user, creates their mirror commitment `Item` with the pact's title + cadence + `pactId`, flips the Pact
  to `active`).
- **Telegram** ([route.ts](../src/app/api/telegram/route.ts)). Add a `/start <code>` branch **above** the
  bare `/start` (currently line 234): a payload resolving to a pending invite calls `acceptPact` (the
  invitee's account is already resolve-or-created by [resolveUser](../src/lib/user.ts)), then replies
  "You're in: gym 3x a week with Jules" + the board button. A typed `pact <itemId>` mints/returns an
  invite for an existing commitment.
- **Board** ([actions.ts](../src/app/actions.ts)). A `startPactAction(itemId)` server action wrapping
  `startPact`, surfaced as a "make it a pact" control on a commitment (minimal here; the contextual
  prompt is Phase B).
- **Invite page.** New public `src/app/p/[code]/page.tsx`: look up the pact by code, render inviter +
  title + an "Open in Telegram" deep link (`${TELEGRAM_BOT_URL}?start=<code>`) + the install steps. Add
  `p` to the [middleware](../src/middleware.ts) matcher allowlist (line 44).

**DoD-A:** from a commitment you get an invite link + message; opening it on a second Telegram account
lands on the framed page, taps through to the bot, and creates a second linked commitment. Both items
carry the `pactId`.

### Phase B — the loop (see each other, retain)
*Outcome: each side sees the other and the shared streak; the nudge names the partner.*

- **[pact.ts](../src/lib/pact.ts).** `partnerStatus(pactId, meUserId)` — the one sanctioned cross-user
  read, returning ONLY the partner's name + this-cycle done state. `pactStreak(...)` — pure, consecutive
  cadence cycles both members honored (mirrors [streak.ts](../src/lib/streak.ts); reads both items' `done`
  Events).
- **Isolation.** Extend [check-isolation.ts](../scripts/check-isolation.ts): a pact partner can read each
  other's pact status and CANNOT read the other's non-pact items.
- **Board** ([page.tsx](../src/app/page.tsx)). A pact card on the pact commitment: both checks for this
  cycle + the shared-streak chip.
- **Nudge.** Keep `buildDailyNudge` pure: [sweep.ts](../src/lib/sweep.ts) enriches the pact item with
  `partnerStatus` and passes it in; [nudge.ts](../src/lib/nudge.ts) renders "Jules already ticked his ·
  you two: week 3" on that line.
- **Discovery.** On creating a recurring commitment (board `createItem` + the telegram create path),
  offer once: "Do this with someone? → make it a pact."

**DoD-B:** both boards show the partner + shared streak; the pact nudge names the partner; a flaky
partner does not break the other's personal streak; `check:isolation` proves the read is narrow.

### Phase C — social + lifecycle (fast follow)
- "Nudge {partner}" one-tap (bot button + board), rate-capped to once per partner per cycle.
- Leave / end pact (server action + `endpact` command): flip the Pact to `ended`, clear the survivor's
  `pactId` so it reverts to a solo commitment.
- Pending-invite expiry: tell the inviter once if unaccepted after N days; the code can carry a TTL.
- New `Event` kinds (`pact_invited | pact_joined | pact_nudge | pact_ended`), attached to the relevant
  member's `Item` (an Event needs an `itemId`; every member has one).

**DoD-C:** either side can leave gracefully; the partner nudge works and is capped; pending invites don't rot.
