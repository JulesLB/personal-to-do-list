# Launch sprint · 4 weeks · day-by-day

*Owner: Jules · Created 2026-06-23 · Status: ACTIVE plan*

The goal of these 4 weeks is **not** revenue and **not** a user count. It's three reps:
**audience** (a content habit that compounds), **launch** (getting ~15–25 strangers to try Ember), and
**support + feedback** (running a real loop). Ember's free users aren't the asset. Your reps and your
own following are.

## The rules (read once, then don't break them)

- **Time cap: ~1.5–2 hrs/week.** If it bleeds into the hours you've set aside for the revenue idea, it
  dies. This is the practice run, not the main event.
- **Agents draft, you approve and post.** Posting from your real accounts, community presence, and the
  final send stay with you. Automated promo gets you banned and reads as botted, which kills the exact
  audience you're building.
- **Three check-in points, nothing else:**
  1. **Approval queue** (drafted posts to edit + publish) — ~2×/week
  2. **Community windows** (you, manually, being useful) — 3×/week, 15 min
  3. **Sunday review** (one digest: what landed, signups, funnel, feedback) — ~20 min

## Channels (locked)

| Channel | Role | Link |
|---|---|---|
| Indie Hackers | Build-log home base (milestone posts) | https://www.indiehackers.com/ |
| Reddit · r/SideProject | Building story, promo-friendly | https://www.reddit.com/r/SideProject/ |
| Reddit · r/indiehackers | Building story | https://www.reddit.com/r/indiehackers/ |
| Reddit · r/getdisciplined | Real users (accountability angle) | https://www.reddit.com/r/getdisciplined/ |
| Reddit · r/productivity | Real users | https://www.reddit.com/r/productivity/ |
| Reddit · r/ADHD_Programmers | Real users, dev-friendly | https://www.reddit.com/r/ADHD_Programmers/ |
| One Discord/Telegram community | Human contact + feedback | find via https://disboard.org/ (search "ADHD" / "productivity") or a subreddit's sidebar |

**Reddit warning:** big subs auto-filter brand-new accounts and many ban app promotion. r/SideProject and
r/indiehackers welcome it; r/getdisciplined and r/productivity tolerate a genuine "I built this for my own
problem" story if it's 90% story and 10% link. **r/ADHD itself bans app promo** — use it to learn the
audience, not to post your link; do your ADHD launch in the Discord/Telegram community instead. Always
read the sub's rules (right sidebar) before posting.

**Posting time:** Reddit traffic peaks US morning = **your evening (HK, UTC+8)**. Post Tue–Thu around
21:00–23:00 HKT for the best shot.

---

## Prerequisites (have these ready before Day 1)

- [ ] Create a **Reddit account** → https://www.reddit.com/register/ (do this first so it ages a few days)
- [ ] Create an **Indie Hackers account** → https://www.indiehackers.com/
- [ ] Pick **one** Discord or Telegram community and join it
- [ ] Decide the **contact email** for the landing page (your existing one is fine)

**Two build items the Sunday review depends on** (these get built with the agent, not by you, but they
must be live before Week 3):

- [ ] **PostHog** analytics in the app (free tier → https://posthog.com/ , Next.js setup
  https://posthog.com/docs/libraries/next-js). Key goes in `.env`. Without it the review has no funnel to read.
- [ ] **`/feedback <msg>`** command in the bot, logging to a table the weekly digest can read.
- [ ] **Contact line on the landing page** — a one-line `mailto:` in the `/landing` + `/get-started`
  footer. No form.

---

## Week 1 — warm up, don't sell

You're building account credibility and learning each room. **Zero promo this week** except one soft IH post.

- **Day 1 (Mon):** Finish the prerequisites checklist above. (~30 min)
- **Day 2 (Tue):** Reddit, 15 min. Comment helpfully on 3 posts in r/SideProject + r/getdisciplined. No
  links, no mention of Ember. You're just earning karma so Week 2–3 posts aren't auto-filtered.
- **Day 3 (Wed):** Community, 15 min. Lurk in your Discord/Telegram pick. Introduce yourself if there's an
  intro channel. Don't pitch.
- **Day 4 (Thu):** **Approve + post your first IH build-log.** (Agent drafts it from your commits; you
  edit to your voice and hit publish.) Frame: "Started sharing what I'm building — an accountability bot
  that nags me and escalates to my wife." (~15 min)
- **Day 5 (Fri):** Reddit, 15 min. 3 more helpful comments. Note which subs feel alive.
- **Day 6 (Sat):** Off.
- **Day 7 (Sun):** **First Sunday review** (~20 min). Even with little to show: did the IH post get any
  views/comments? Anything in feedback? Write 3 lines. This is the habit.

## Week 2 — first build-in-public, soft

Two drafted posts. Still being a human in the community, still no hard promo there.

- **Day 8 (Mon):** Off (or skim community, 5 min).
- **Day 9 (Tue):** **Approve + post Reddit #1** in r/SideProject. Framing: "I built this for my own
  follow-through problem" — a story with a screenshot/GIF (the burn-to-ash completion or the referee
  escalation). Link at the bottom, not the top. (~15 min)
- **Day 10 (Wed):** Community, 15 min. Reply to threads where accountability/follow-through comes up. Still
  no pitch — you're becoming a known face before Week 3.
- **Day 11 (Thu):** **Approve + post IH build-log #2** (the referee mechanic, or what you learned from the
  Reddit post). (~15 min)
- **Day 12 (Fri):** Reddit, 10 min. Reply to every comment on your Day 9 post. Replying well matters more
  than the post.
- **Day 13 (Sat):** Off.
- **Day 14 (Sun):** **Sunday review** (~20 min): views, any signups, the first real feedback. Decide the
  exact sub + angle for next week's launch.

## Week 3 — the real launch

This is your Phase 0 recruiting moment. Aim for **15–25 people trying Ember**.

- **Day 15 (Mon):** Final check: PostHog firing, `/feedback` works, landing contact line live. (~15 min)
- **Day 16 (Tue):** **The niche launch.** Post in your **Discord/Telegram ADHD community** (not r/ADHD —
  it bans promo): "I made a bot that actually nags me and tells my wife when I dodge things. Free, looking
  for a few people to break it." Genuine, useful, not salesy. (~20 min)
- **Day 17 (Wed):** **Handle inbound.** 10 min, 2× today. Agent drafts support replies; you read, fix the
  tone, send. Watch the PostHog funnel — where do people drop between landing and first task?
- **Day 18 (Thu):** **Approve + post IH:** "launched to a community, here's what happened." Numbers and
  honesty pull more than hype. (~15 min). Keep handling inbound.
- **Day 19 (Fri):** Support check, 10 min. Reply to everyone. Note the top 3 complaints.
- **Day 20 (Sat):** Off (quick support glance if launch is live).
- **Day 21 (Sun):** **Sunday review** (~30 min this week): how many tried it, how many sent a second task,
  the top complaints. Pick **one fix** to ship next week.

## Week 4 — close the loop, decide

- **Day 22 (Mon):** Ship the one fix from feedback (with the agent). (~30–45 min)
- **Day 23 (Tue):** **Tell the people who reported it** that it's fixed. This is the whole support rep:
  heard → shipped → told them. (~10 min)
- **Day 24 (Wed):** Community, 15 min. Thank early testers, ask the ones who went quiet *why* (the most
  valuable feedback you'll get).
- **Day 25 (Thu):** **Approve + post your best content type:** "what ~20 strangers taught me about
  [accountability / shipping solo] in a week." (~15 min)
- **Day 26 (Fri):** Reddit/community, 10 min. Reply to comments.
- **Day 27 (Sat):** Off.
- **Day 28 (Sun):** **Go/no-go review** (~30 min). The two numbers that decide it:
  - Did **anyone reach day 14 still using it**? (retention = the real signal)
  - Is the **content pulling** anyone in (followers, comments, signups trending up)?

  Honest verdict: **continue** (you found a channel + retention, keep going lighter), or **pocket the
  reps and stop** (you learned launch/support/feedback/audience — that *was* the win). No guilt either way.

---

## Quick-reference: every link in one place

**Accounts to create**
- Reddit: https://www.reddit.com/register/
- Indie Hackers: https://www.indiehackers.com/
- PostHog (free): https://posthog.com/ · Next.js setup: https://posthog.com/docs/libraries/next-js
- Find a community: https://disboard.org/

**Where you post**
- Indie Hackers: https://www.indiehackers.com/
- r/SideProject: https://www.reddit.com/r/SideProject/
- r/indiehackers: https://www.reddit.com/r/indiehackers/
- r/getdisciplined: https://www.reddit.com/r/getdisciplined/
- r/productivity: https://www.reddit.com/r/productivity/
- r/ADHD_Programmers: https://www.reddit.com/r/ADHD_Programmers/

**Optional later (not in these 4 weeks)**
- Product Hunt (one-shot spike): https://www.producthunt.com/
- Hacker News "Show HN": https://news.ycombinator.com/show
