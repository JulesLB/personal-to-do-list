import type { Item } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rankActionable, sortByDate, dueInLabel, dueTone, daysOverdue, commitmentDue, deferState, parkingAgeLabel, isStaleParking, isoHKT, CATEGORIES, type Category, type Ranked } from "@/lib/rank";
import { EditTrigger, type EditableItem } from "./EditTrigger";
import { SnoozeMenu } from "./SnoozeMenu";
import { BurnButton } from "./BurnButton";
import { AddItem } from "./AddItem";
import { currentStreak } from "@/lib/streak";

export const dynamic = "force-dynamic";

const meta = (c: string | null) => (c && c in CATEGORIES ? CATEGORIES[c as Category] : null);

const toEditable = (i: Item): EditableItem => ({
  id: i.id,
  title: i.title,
  category: i.category,
  deadline: i.deadline ? isoHKT(i.deadline) : null,
  referee: i.referee,
  cadence: i.cadence,
});

// A small colored-dot pill: same look on the top filter row and on each task.
function Cat({ c }: { c: string | null }) {
  const m = meta(c);
  if (!m) return null;
  return (
    <span className="cat" style={{ "--c": m.dot } as React.CSSProperties}>
      <span className="dot" />
      {m.label}
    </span>
  );
}

export default async function Board({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const active = cat && cat in CATEGORIES ? (cat as Category) : null;

  const now = new Date();
  // One batched round trip for the whole render. The streak needs the full table
  // (done/retired rows too: a fire that was due and cleared), so we fetch every
  // item plus the done events, then derive the open list in memory. allOpen is a
  // strict subset of allItems, so querying it separately was a wasted round trip.
  const [allItems, dones] = await prisma.$transaction([
    prisma.item.findMany(),
    prisma.event.findMany({ where: { kind: "done" }, select: { createdAt: true } }),
  ]);
  const allOpen = allItems.filter((i) => i.status === "open");
  const streak = currentStreak(allItems, dones, now);
  const countFor = (c: Category) =>
    allOpen.filter((i) => i.type !== "parking" && i.category === c).length;

  const scoped = active ? allOpen.filter((i) => i.category === active) : allOpen;
  const ranked = rankActionable(scoped, now);
  const parking = scoped.filter((i) => i.type === "parking");

  const hero = ranked[0] ?? null;
  const rest = ranked.slice(1);
  const inHeat = (h: Ranked["heat"]) => rest.filter((r) => r.heat === h);

  // A commitment's due date renders relative (in days), same as a task, so the
  // whole list reads in one language instead of mixing absolute dates and counts.
  const dueOf = (i: Item) =>
    i.type === "commitment"
      ? dueInLabel(commitmentDue(i), now)
      : i.deadline
        ? dueInLabel(i.deadline, now)
        : null;

  // The push tally as one escalating warning icon: orange at one push, red at two,
  // red and pulsing at three or more. The count lives in the tooltip.
  const Pushed = ({ i }: { i: Item }) => {
    const d = deferState(i);
    if (!d) return null;
    return (
      <span
        className={`defer-warn ${d.tier}`}
        title={`Pushed ${d.count} time${d.count > 1 ? "s" : ""}`}
        aria-label={`Pushed ${d.count} times`}
      >
        ⚠
      </span>
    );
  };

  // One ranked row: tap the body to edit; only the tick remains as a button.
  // Snooze lives on the hero alone, everything else is one tap to validate.
  const Row = ({ r }: { r: Ranked }) => {
    const i = r.item;
    const due = dueOf(i);
    const overdue = daysOverdue(i, now) > 0;
    return (
      <div className={`row tone-${dueTone(i, now)}${overdue ? " overdue" : ""}`} data-burnable>
        <EditTrigger item={toEditable(i)} className="row-main">
          <div className="row-title">{i.title}</div>
          <div className="row-meta">
            <Cat c={i.category} />
            {due ? <span className={`dl dl-${dueTone(i, now)}`}>{due}</span> : null}
            {i.referee ? <span className="ref">{i.referee}</span> : null}
            <Pushed i={i} />
          </div>
        </EditTrigger>
        <div className="row-actions">
          <BurnButton id={i.id} variant="row" commitment={i.type === "commitment"} />
        </div>
      </div>
    );
  };

  // A heat band inside the one queue card. Collapsible bands use <details>.
  const Band = ({
    rows,
    ico,
    name,
    cls,
    collapsible,
    open,
  }: {
    rows: Ranked[];
    ico: string;
    name: string;
    cls: string;
    collapsible?: boolean;
    open?: boolean;
  }) => {
    if (!rows.length) return null;
    const head = (
      <>
        <span className="band-ico">{ico}</span> {name} <span className="band-count">{rows.length}</span>
      </>
    );
    const list = (
      <div className="feed">
        {rows.map((r) => (
          <Row key={r.item.id} r={r} />
        ))}
      </div>
    );
    if (collapsible) {
      return (
        <details className={`band band-${cls}`} open={open}>
          <summary className="band-head">{head}</summary>
          {list}
        </details>
      );
    }
    return (
      <div className={`band band-${cls}`}>
        <div className="band-head">{head}</div>
        {list}
      </div>
    );
  };

  // Every band uses the one order: soonest due date first, importance breaking
  // ties on the same day. burning already comes pre-sorted from rankActionable.
  const burning = inHeat("burning");
  const soon = sortByDate(inHeat("soon"));
  const later = sortByDate(inHeat("later"));

  return (
    <main className="wrap">
      {/* Defined once: the fractal-noise filter that gives the burn-to-ash flames
          a torn, licked edge. Static on purpose — the noise is baked a single time,
          not re-generated per frame (the old SMIL <animate> version regenerated the
          whole noise field 60x a second on the CPU, which was the lag). The motion,
          sweep + flicker, lives on transform/opacity in globals.css (.igniting), the
          two things the GPU animates for free. */}
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        <filter
          id="ember-fire"
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02 0.045"
            numOctaves={3}
            seed={7}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="46"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <header className="topbar">
        <span className="brand">
          <img className="brand-logo" src="/logo.png" alt="" width={24} height={24} />
          <span className="wordmark">Ember</span>
        </span>
        <span
          className={`streak${streak > 0 ? " lit" : ""}`}
          title="Days in a row you cleared a fire. Quiet days don't break it; ignoring something that's due does."
        >
          <span className="streak-flame">{streak > 0 ? "🔥" : "🕯️"}</span>
          <span className="streak-text">
            {streak > 0 ? (
              <>
                <strong>{streak}</strong> days streak
              </>
            ) : (
              "No streak yet"
            )}
          </span>
        </span>
        <AddItem />
      </header>

      <nav className="filters">
        {(Object.keys(CATEGORIES) as Category[]).map((c) => {
          const m = CATEGORIES[c];
          const on = active === c;
          return (
            <a
              key={c}
              href={on ? "/" : `/?cat=${c}`}
              className={`cat-chip${on ? " active" : ""}`}
              style={{ "--c": m.dot } as React.CSSProperties}
            >
              <span className="dot" />
              <span className="cat-chip-name">{m.label}</span>
              <span className="cat-chip-count">{countFor(c)}</span>
            </a>
          );
        })}
      </nav>

      {hero ? (
        // Keyed by item id so each promoted hero gets its own fresh node. The hero
        // is a single reused slot; without a key React keeps the same element when
        // the top item changes, and the burn's imperative .burned class (display:none)
        // sticks to it whenever the next hero shares the same heat (the className prop
        // is unchanged, so React never clears it) — the new hero stayed hidden. The
        // key forces unmount + remount, dropping .burned. Rows are already id-keyed.
        <section key={hero.item.id} className={`hero hero-${hero.heat}`} data-burnable>
          <div className="hero-left">
            <div className="hero-kicker">
              {hero.heat === "burning" ? "🔥 Do this first" : "Top priority"}
            </div>
            <EditTrigger item={toEditable(hero.item)} className="hero-body">
              <div className="hero-title">{hero.item.title}</div>
              <div className="hero-meta">
                <Cat c={hero.item.category} />
                {dueOf(hero.item) ? <span className={`dl dl-${dueTone(hero.item, now)}`}>{dueOf(hero.item)}</span> : null}
                {hero.item.referee ? <span className="ref ref-hero">{hero.item.referee}</span> : null}
                <Pushed i={hero.item} />
              </div>
            </EditTrigger>
          </div>
          <div className="hero-actions">
            <BurnButton id={hero.item.id} variant="hero" />
            <SnoozeMenu id={hero.item.id} />
          </div>
        </section>
      ) : (
        <section className="empty-state">
          {active
            ? `Nothing in ${CATEGORIES[active].label} right now.`
            : "Nothing on the list. Text the bot to add something."}
        </section>
      )}

      <Band rows={burning} ico="🔥" name="On fire" cls="burning" />
      <Band rows={soon} ico="⏳" name="Heating up" cls="soon" collapsible open />
      <Band rows={later} ico="🧊" name="Back burner" cls="later" collapsible />
      {parking.length ? (
        <details className="band band-parking">
          <summary className="band-head">
            <span className="band-ico">🅿️</span> Parking lot <span className="band-count">{parking.length}</span>
          </summary>
          <div className="feed">
            {parking.map((i) => {
              const stale = isStaleParking(i, now);
              return (
                <div className={`row${stale ? " stale" : ""}`} key={i.id}>
                  <EditTrigger item={toEditable(i)} className="row-main">
                    <div className="row-title">{i.title}</div>
                    <div className="row-meta">
                      <Cat c={i.category} />
                      <span className="age">{parkingAgeLabel(i.createdAt, now)}</span>
                      {stale ? <span className="pushed">Decide: date it or drop it</span> : null}
                    </div>
                  </EditTrigger>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </main>
  );
}
