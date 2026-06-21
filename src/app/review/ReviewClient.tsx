"use client";

import { useMemo, useState } from "react";
import { BUCKET_ORDER, type TriageBucket } from "@/lib/triage";
import { CATEGORIES, type Category } from "@/lib/rank";
import type { Receipts } from "@/lib/receipts";
import type { CoachAnalysis } from "@/lib/coach";
import { refreshAnalysis } from "../actions";
import { BurnButton } from "../BurnButton";
import { EditTrigger, type EditableItem } from "../EditTrigger";

// One slipping item, flattened to a serializable shape on the server so this
// client component never touches Prisma types or env (the wa.me number lookup
// happens server-side and arrives as a ready URL).
export type ReviewEntry = {
  id: number;
  bucket: TriageBucket;
  weight: number;
  title: string;
  category: string | null;
  referee: string | null;
  due: string | null;
  detail: string | null;
  commitment: boolean;
  waUrl: string | null;
  edit: EditableItem;
};

const BUCKET_META: Record<TriageBucket, { ico: string; name: string; blurb: string }> = {
  escalated: { ico: "🚨", name: "Already escalated", blurb: "Someone was told. Put it out." },
  dodging: { ico: "🔁", name: "Keep dodging", blurb: "Pushed again and again." },
  death_zone: { ico: "💀", name: "Death zone", blurb: "Parked 7+ days. Date it or drop it." },
};

// One scoreboard box. A danger box reads red when it has a count; the two good boxes
// (cleared, streak) get their own tints via the cls. Calm grey at zero.
function Box({ ico, num, label, cls }: { ico: string; num: number; label: string; cls: string }) {
  return (
    <div className={`sb-box sb-${cls}${num > 0 ? " active" : ""}`}>
      <span className="sb-ico">{ico}</span>
      <span className="sb-num">{num}</span>
      <span className="sb-label">{label}</span>
    </div>
  );
}

function Cat({ c }: { c: string | null }) {
  const m = c && c in CATEGORIES ? CATEGORIES[c as Category] : null;
  if (!m) return null;
  return (
    <span className="cat" style={{ "--c": m.dot } as React.CSSProperties}>
      <span className="dot" />
      {m.label}
    </span>
  );
}

function relAge(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Claude's read, the headline value of the page. Three beats you take in at a
// glance: the habit, what to change, the one move. Refresh is a server action
// (one Haiku call), so freshness is the user's call and a page load never pays
// for it on its own.
function Coach({ analysis }: { analysis: CoachAnalysis }) {
  return (
    <section className="coach">
      <header className="coach-head">
        <span className="coach-title">🧠 Your read</span>
        <form action={refreshAnalysis}>
          <button className="coach-refresh" type="submit">
            ↻ Refresh
          </button>
        </form>
      </header>
      <div className="coach-beat">
        <div className="coach-sub">The pattern</div>
        <p className="coach-text">{analysis.pattern}</p>
      </div>
      {analysis.soWhat ? (
        <div className="coach-beat">
          <div className="coach-sub">What to change</div>
          <p className="coach-text">{analysis.soWhat}</p>
        </div>
      ) : null}
      {analysis.doThis ? (
        <div className="coach-beat coach-do">
          <div className="coach-sub">Do this</div>
          <p className="coach-text">{analysis.doThis}</p>
        </div>
      ) : null}
      <div className="coach-stamp">Updated {relAge(analysis.generatedAt)}</div>
    </section>
  );
}

export function ReviewClient({
  entries,
  receipts,
  analysis,
  overdue,
}: {
  entries: ReviewEntry[];
  receipts: Receipts;
  analysis: CoachAnalysis | null;
  overdue: number;
}) {
  // Acting on a row drops it here at once, so its scoreboard box ticks down in the
  // same beat the flames die. The server action revalidates in the background to match.
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const drop = (id: number) => setRemoved((s) => new Set(s).add(id));

  const visible = entries.filter((e) => !removed.has(e.id));

  const grouped = useMemo(() => {
    const m = new Map<TriageBucket, ReviewEntry[]>();
    for (const e of visible) {
      const arr = m.get(e.bucket) ?? [];
      arr.push(e);
      m.set(e.bucket, arr);
    }
    return m;
  }, [visible]);

  const tw = receipts.thisWeek;
  const cnt = (b: TriageBucket) => grouped.get(b)?.length ?? 0;

  return (
    <>
      <section className="scoreboard">
        <Box ico="🚨" num={cnt("escalated")} label="Escalated" cls="escalated" />
        <Box ico="⏰" num={overdue} label="Overdue" cls="overdue" />
        <Box ico="🔁" num={cnt("dodging")} label="Keep dodging" cls="dodging" />
        <Box ico="💀" num={cnt("death_zone")} label="Death zone" cls="death_zone" />
        <Box ico="✅" num={tw.cleared} label="Cleared this week" cls="cleared" />
        <Box ico="🔥" num={receipts.streak} label="Day streak" cls="streak" />
      </section>

      {analysis ? <Coach analysis={analysis} /> : null}

      {visible.length === 0 ? (
        <section className="all-clear">
          <div className="all-clear-ico">🌙</div>
          <strong>Nothing&apos;s slipping.</strong>
          <span>No fires, nothing rotting. Rare. Enjoy it.</span>
        </section>
      ) : (
        BUCKET_ORDER.map((b) => {
          const rows = grouped.get(b);
          if (!rows || !rows.length) return null;
          const meta = BUCKET_META[b];
          return (
            <section className={`triage triage-${b}`} key={b}>
              <header className="triage-head">
                <span className="triage-ico">{meta.ico}</span>
                <span className="triage-name">{meta.name}</span>
                <span className="triage-count">{rows.length}</span>
                <span className="triage-blurb">{meta.blurb}</span>
              </header>
              <div className="triage-feed">
                {rows.map((e) => (
                  <div className="trow" data-burnable key={e.id}>
                    <EditTrigger item={e.edit} className="trow-main">
                      <div className="trow-title">{e.title}</div>
                      <div className="trow-meta">
                        <Cat c={e.category} />
                        {e.due ? <span className="dl dl-burning">{e.due}</span> : null}
                        {e.bucket === "death_zone" ? (
                          <span className="pushed">Decide: date it or drop it</span>
                        ) : e.detail ? (
                          <span className="trow-detail">{e.detail}</span>
                        ) : null}
                        {e.referee ? <span className="ref">{e.referee}</span> : null}
                      </div>
                    </EditTrigger>
                    <div className="trow-actions">
                      {e.waUrl ? (
                        <a
                          className="tell-ref"
                          href={e.waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Tell {e.referee}
                        </a>
                      ) : null}
                      <BurnButton
                        id={e.id}
                        variant="row"
                        commitment={e.commitment}
                        onDone={() => drop(e.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
