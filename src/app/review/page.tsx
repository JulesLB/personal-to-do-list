import type { Item } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { dueInLabel, commitmentDue, daysOverdue, isoHKT, timeHKT } from "@/lib/rank";
import { triage, BUCKET_WEIGHT } from "@/lib/triage";
import { weeklyReceipts } from "@/lib/receipts";
import { readCachedAnalysis, forceAnalysis } from "@/lib/reviewAnalysis";
import { coachReady, warmingMessage } from "@/lib/coach";
import { after } from "next/server";
import { waLink } from "@/lib/waLink";
import { currentUser } from "@/lib/session";
import { ReviewClient, type ReviewEntry } from "./ReviewClient";

export const dynamic = "force-dynamic";

const toEditable = (i: Item) => ({
  id: i.id,
  title: i.title,
  deadline: i.deadline ? isoHKT(i.deadline) : null,
  dueTime: i.dueAt ? timeHKT(i.dueAt) : null,
  referee: i.referee,
  cadence: i.cadence,
});

// What the manual "Tell <referee>" link says. Mirrors the sharp tone of the
// auto-escalation copy so a hand-sent poke reads the same as a cron-sent one.
const refDraft = (i: Item) =>
  `Accountability check: I committed to "${i.title}" and I keep dodging it. Hold me to it.`;

export default async function Review() {
  const now = new Date();
  // PRD-11: scope to the logged-in user (from the signed session cookie).
  const me = await currentUser();
  const [allItems, events] = me
    ? await prisma.$transaction([
        prisma.item.findMany({ where: { userId: me.id } }),
        prisma.event.findMany({
          where: { item: { userId: me.id } },
          select: { itemId: true, kind: true, createdAt: true },
        }),
      ])
    : [[], []];
  const open = allItems.filter((i) => i.status === "open");

  const t = triage(open, events, now);
  const receipts = weeklyReceipts(allItems, events, now);
  // Cold start: until there's real behavior to read, show generic encouragement
  // and don't call the model at all (no fabricated "pattern", no wasted tokens).
  const ready = coachReady(allItems, events, now);
  const warming = ready ? null : warmingMessage(receipts.thisWeek.cleared, receipts.streak);
  // Read the coach card straight from cache so the page never waits on the model.
  // If the cache is stale or missing, regenerate it after the response is sent
  // (next visit shows the fresh read) instead of blocking this render on Haiku.
  const { analysis, stale } =
    ready && me ? await readCachedAnalysis(me.id, now) : { analysis: null, stale: false };
  if (ready && me && stale) {
    after(() => forceAnalysis(me.id, allItems, events, now));
  }

  // A flat count for the scoreboard: how many open items are already past due. It
  // cuts across buckets (an overdue item may also be dodged or escalated), so it's
  // its own tally, not a triage bucket.
  const overdue = open.filter((i) => daysOverdue(i, now) > 0).length;

  const entries: ReviewEntry[] = t.entries.map(({ item, bucket }) => {
    const due =
      item.type === "commitment"
        ? dueInLabel(commitmentDue(item), now)
        : item.deadline
          ? dueInLabel(item.deadline, now)
          : null;
    // Death zone shows the board's red "decide it" flag instead of a text detail,
    // so it's left null here and rendered as a chip in the client.
    const detail =
      bucket === "escalated"
        ? `told ${item.referee}`
        : bucket === "dodging"
          ? `Pushed ${item.deferCount} time${item.deferCount === 1 ? "" : "s"}`
          : null;
    const wa = bucket === "escalated" ? waLink(item.referee, refDraft(item)) : null;
    return {
      id: item.id,
      bucket,
      weight: BUCKET_WEIGHT[bucket],
      title: item.title,
      referee: item.referee,
      due,
      detail,
      commitment: item.type === "commitment",
      waUrl: wa,
      edit: toEditable(item),
    };
  });

  return (
    <main className="wrap">
      {/* Same baked fractal-noise filter the board uses for the burn-to-ash edge,
          redeclared here so the Review page's flames can reference it too. Static
          on purpose — no per-frame CPU. */}
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        <filter id="ember-fire" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.045" numOctaves={3} seed={7} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <header className="topbar topbar-review">
        <span className="brand">
          <img className="brand-logo" src="/logo.png" alt="" width={24} height={24} />
          <span className="wordmark">Ember</span>
        </span>
        <Link href="/" className="nav-btn">
          Tasks
        </Link>
      </header>

      <ReviewClient
        entries={entries}
        receipts={receipts}
        analysis={analysis}
        warming={warming}
        overdue={overdue}
      />
    </main>
  );
}
