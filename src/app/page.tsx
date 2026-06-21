import type { Item } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rankActionable, sortByDate, dueInLabel, dueTone, daysOverdue, commitmentDue, deferState, parkingAgeLabel, isStaleParking, isoHKT, CATEGORIES, type Category, type Ranked } from "@/lib/rank";
import { EditTrigger, type EditableItem } from "./EditTrigger";
import { BurnButton } from "./BurnButton";
import { AddItem } from "./AddItem";
import { ReviewHint } from "./ReviewHint";
import { currentStreak } from "@/lib/streak";
import { currentUser } from "@/lib/session";

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

export default async function Board() {
  // Optional deep link to the bot, shown on the first-run screen so a new user
  // can jump straight into the chat (the primary capture surface). Unset = the
  // step still reads, just without the button.
  const botUrl = process.env.TELEGRAM_BOT_URL;
  const now = new Date();
  // One batched round trip for the whole render. The streak needs the full table
  // (done/retired rows too: a fire that was due and cleared), so we fetch every
  // item plus the event log, then derive the open list in memory. allOpen is a
  // strict subset of allItems, so querying it separately was a wasted round trip.
  // We pull all events (not just done) so the weekly receipts can read snoozed /
  // promised too; the streak just filters to done in memory.
  // PRD-11: scope to the logged-in user (resolved from the signed session cookie).
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
  const dones = events.filter((e) => e.kind === "done");
  const allOpen = allItems.filter((i) => i.status === "open");
  const streak = currentStreak(allItems, dones, now);

  const ranked = rankActionable(allOpen, now);
  const parking = allOpen.filter((i) => i.type === "parking");

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

  // The push tally as one steady warning marker — "you keep dodging this." Same
  // style regardless of count; the exact count lives in the tooltip.
  const Pushed = ({ i }: { i: Item }) => {
    const d = deferState(i);
    if (!d) return null;
    return (
      <span
        className="defer-warn"
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
          <div className="row-title">
            {i.title}
            <Pushed i={i} />
          </div>
          <div className="row-meta">
            <Cat c={i.category} />
            {due ? <span className={`dl dl-${dueTone(i, now)}`}>{due}</span> : null}
            {i.referee ? <span className="ref">{i.referee}</span> : null}
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
                <strong>{streak}</strong> day streak
              </>
            ) : (
              "No streak yet"
            )}
          </span>
        </span>
        <div className="topbar-right">
          <ReviewHint enabled={allItems.length > 0} />
          <AddItem />
        </div>
      </header>

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
              {hero.heat === "burning" ? "Do this first" : "Top priority"}
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
          </div>
        </section>
      ) : allItems.length === 0 ? (
        // First run: the empty list is the onboarding. One primary action, the
        // loop explained in a line, no wizard. Self-collapsing the moment an item
        // lands. The urgency bands and streak teach themselves once there's content.
        <section className="firstrun">
          <h1 className="firstrun-title">
            {me?.name ? `Welcome, ${me.name}.` : "Welcome to Ember."}
          </h1>
          <p className="firstrun-lede">
            Ember turns the things you keep putting off into a list that nags you until they are done.
            Here is how it works.
          </p>
          <ol className="firstrun-steps">
            <li className="fr-step">
              <span className="fr-num">1</span>
              <div className="fr-body">
                <div className="fr-h">Text the bot, even messy</div>
                <p className="fr-p">
                  Send it like you would text a friend: &quot;call the dentist sometime next week,
                  important&quot;. Ember reads the mess and turns it into a dated, sorted task. Voice
                  notes work too.
                </p>
                {botUrl ? (
                  <a className="fr-link" href={botUrl} target="_blank" rel="noopener noreferrer">
                    Open Ember in Telegram →
                  </a>
                ) : null}
              </div>
            </li>
            <li className="fr-step">
              <span className="fr-num">2</span>
              <div className="fr-body">
                <div className="fr-h">Get nudged when it matters</div>
                <p className="fr-p">
                  Morning and night, Ember pings you only when something is actually due, and stays
                  quiet otherwise.
                </p>
              </div>
            </li>
            <li className="fr-step">
              <span className="fr-num">3</span>
              <div className="fr-body">
                <div className="fr-h">Review reads your week back</div>
                <p className="fr-p">
                  The Review button up top shows what you cleared, what is slipping, and a coach once
                  it has learned your habits.
                </p>
              </div>
            </li>
          </ol>
          <div className="firstrun-or">
            <AddItem variant="cta" />
            <span className="fr-or-note">Prefer to type it here? Add your first task.</span>
          </div>
        </section>
      ) : (
        <section className="empty-state">
          Nothing pressing. Text the bot to add something.
        </section>
      )}

      <Band rows={burning} ico="🚨" name="On fire" cls="burning" />
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
