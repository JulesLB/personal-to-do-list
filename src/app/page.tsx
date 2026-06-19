import type { Item } from "@prisma/client";
import { prisma } from "@/lib/db";
import { markDone } from "./actions";
import { rankActionable, dueInLabel, commitmentDueLabel, cadenceLabel, isoHKT, CATEGORIES, type Category, type Ranked } from "@/lib/rank";
import { EditTrigger, type EditableItem } from "./EditTrigger";
import { SnoozeMenu } from "./SnoozeMenu";

export const dynamic = "force-dynamic";

const meta = (c: string | null) => (c && c in CATEGORIES ? CATEGORIES[c as Category] : null);

const toEditable = (i: Item): EditableItem => ({
  id: i.id,
  title: i.title,
  type: i.type,
  category: i.category,
  important: i.important,
  urgent: i.urgent,
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
  const allOpen = await prisma.item.findMany({ where: { status: "open" } });
  const countFor = (c: Category) =>
    allOpen.filter((i) => i.type !== "parking" && i.category === c).length;

  const scoped = active ? allOpen.filter((i) => i.category === active) : allOpen;
  const ranked = rankActionable(scoped, now);
  const parking = scoped.filter((i) => i.type === "parking");

  const hero = ranked[0] ?? null;
  const rest = ranked.slice(1);
  const inHeat = (h: Ranked["heat"]) => rest.filter((r) => r.heat === h);

  // One ranked row: tap the body to edit; only the tick remains as a button.
  // Snooze lives on the hero alone, everything else is one tap to validate.
  const Row = ({ r }: { r: Ranked }) => {
    const i = r.item;
    return (
      <div className={`row heat-${r.heat}`}>
        <EditTrigger item={toEditable(i)} className="row-main">
          <div className="row-title">{i.title}</div>
          <div className="row-meta">
            <Cat c={i.category} />
            {i.type === "commitment" ? (
              <span className={`dl dl-${r.heat}`}>{commitmentDueLabel(i, now)}</span>
            ) : i.deadline ? (
              <span className={`dl dl-${r.heat}`}>{dueInLabel(i.deadline, now)}</span>
            ) : null}
            {i.type === "commitment" && i.cadence ? <span className="ref">{cadenceLabel(i.cadence)}</span> : null}
            {i.referee ? <span className="ref">{i.referee}</span> : null}
          </div>
        </EditTrigger>
        <div className="row-actions">
          <form action={markDone.bind(null, i.id)}>
            <button className="done" aria-label={i.type === "commitment" ? "honored this cycle" : "mark done"}>✓</button>
          </form>
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

  const burning = inHeat("burning");
  const soon = inHeat("soon");
  const later = inHeat("later");

  return (
    <main className="wrap">
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
        <section className={`hero hero-${hero.heat}`}>
          <div className="hero-left">
            <div className="hero-kicker">
              {hero.heat === "burning" ? "🔥 Burning · do this first" : "Top priority"}
            </div>
            <EditTrigger item={toEditable(hero.item)} className="hero-body">
              <div className="hero-title">{hero.item.title}</div>
              <div className="hero-meta">
                <Cat c={hero.item.category} />
                {hero.item.type === "commitment" ? (
                  <span className="dl">{commitmentDueLabel(hero.item, now)}</span>
                ) : hero.item.deadline ? (
                  <span className="dl">{dueInLabel(hero.item.deadline, now)}</span>
                ) : null}
                {hero.item.type === "commitment" && hero.item.cadence ? (
                  <span className="ref ref-hero">{cadenceLabel(hero.item.cadence)}</span>
                ) : null}
                {hero.item.referee ? <span className="ref ref-hero">{hero.item.referee}</span> : null}
              </div>
            </EditTrigger>
          </div>
          <div className="hero-actions">
            <form action={markDone.bind(null, hero.item.id)}>
              <button className="done-lg">Done</button>
            </form>
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
            {parking.map((i) => (
              <div className="row heat-later" key={i.id}>
                <EditTrigger item={toEditable(i)} className="row-main">
                  <div className="row-title">{i.title}</div>
                  <div className="row-meta">
                    <Cat c={i.category} />
                  </div>
                </EditTrigger>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </main>
  );
}
