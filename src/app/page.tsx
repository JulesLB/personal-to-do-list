import type { Item } from "@prisma/client";
import { prisma } from "@/lib/db";
import { markDone, remove, retire, promote } from "./actions";
import { rankActionable, dueInLabel, commitmentDueLabel, cadenceLabel, isoHKT, CATEGORIES, type Category, type Ranked } from "@/lib/rank";
import { waLink } from "@/lib/waLink";
import { EditModal, type EditableItem } from "./EditModal";
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

  const Row = ({ r }: { r: Ranked }) => {
    const i = r.item;
    return (
      <div className={`row heat-${r.heat}`}>
        <div className="row-main">
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
        </div>
        <div className="row-actions">
          <form action={markDone.bind(null, i.id)}>
            <button className="done" aria-label={i.type === "commitment" ? "honored this cycle" : "mark done"}>✓</button>
          </form>
          <SnoozeMenu id={i.id} />
          <EditModal item={toEditable(i)} />
          {i.type === "commitment" ? (
            <form action={retire.bind(null, i.id)}>
              <button className="del" aria-label="retire commitment" title="Retire for good">×</button>
            </form>
          ) : null}
        </div>
      </div>
    );
  };

  const heroTell =
    hero && hero.heat === "burning"
      ? waLink(hero.item.referee, `Accountability check: I still need to "${hero.item.title}". Hold me to it.`)
      : null;

  return (
    <main className="wrap">
      <nav className="cat-grid">
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
              <span className="cat-chip-count">({countFor(c)})</span>
            </a>
          );
        })}
      </nav>

      {hero ? (
        <section className={`hero hero-${hero.heat}`}>
          <div className="hero-kicker">
            {hero.heat === "burning" ? "🔥 Burning · do this first" : "Top priority"}
          </div>
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
          <div className="hero-actions">
            <form action={markDone.bind(null, hero.item.id)}>
              <button className="done-lg">Done</button>
            </form>
            {heroTell ? (
              <a className="tell" href={heroTell}>
                Tell {hero.item.referee}
              </a>
            ) : null}
            <SnoozeMenu id={hero.item.id} />
            <EditModal item={toEditable(hero.item)} />
            {hero.item.type === "commitment" ? (
              <form action={retire.bind(null, hero.item.id)}>
                <button className="retire-lg" title="Retire this commitment for good">Retire</button>
              </form>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="empty-state">
          {active
            ? `Nothing in ${CATEGORIES[active].label} right now.`
            : "Nothing on the list. Text the bot to add something."}
        </section>
      )}

      {inHeat("burning").length ? (
        <section className="sec sec-burning">
          <h2 className="sec-head">
            <span className="sec-ico">🔥</span> On fire <span className="sec-count">({inHeat("burning").length})</span>
          </h2>
          <div className="feed">
            {inHeat("burning").map((r) => (
              <Row key={r.item.id} r={r} />
            ))}
          </div>
        </section>
      ) : null}

      {inHeat("soon").length ? (
        <details className="sec sec-soon" open>
          <summary className="sec-head">
            <span className="sec-ico">⏳</span> Heating up <span className="sec-count">({inHeat("soon").length})</span>
          </summary>
          <div className="feed">
            {inHeat("soon").map((r) => (
              <Row key={r.item.id} r={r} />
            ))}
          </div>
        </details>
      ) : null}

      {inHeat("later").length ? (
        <details className="sec sec-later">
          <summary className="sec-head">
            <span className="sec-ico">🧊</span> Back burner <span className="sec-count">({inHeat("later").length})</span>
          </summary>
          <div className="feed">
            {inHeat("later").map((r) => (
              <Row key={r.item.id} r={r} />
            ))}
          </div>
        </details>
      ) : null}

      {parking.length ? (
        <details className="sec sec-parking">
          <summary className="sec-head">
            <span className="sec-ico">🅿️</span> Parking lot <span className="sec-count">({parking.length})</span>
          </summary>
          <div className="feed">
            {parking.map((i) => (
              <div className="row heat-later" key={i.id}>
                <div className="row-main">
                  <div className="row-title">{i.title}</div>
                  <div className="row-meta">
                    <Cat c={i.category} />
                  </div>
                </div>
                <div className="row-actions">
                  <form action={promote.bind(null, i.id)}>
                    <button className="promote" title="Promote to a task">↑ Task</button>
                  </form>
                  <EditModal item={toEditable(i)} />
                  <form action={remove.bind(null, i.id)}>
                    <button className="del" aria-label="drop">×</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </main>
  );
}
