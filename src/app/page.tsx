import { prisma } from "@/lib/db";
import { markDone, remove, retire } from "./actions";
import {
  rankActionable,
  deadlineLabel,
  dueInLabel,
  CATEGORIES,
  type Category,
  type Heat,
  type Ranked,
} from "@/lib/rank";
import { waLink } from "@/lib/waLink";

export const dynamic = "force-dynamic";

const meta = (c: string | null) => (c && c in CATEGORIES ? CATEGORIES[c as Category] : null);

// The ranked feed, split into three pressure bands. Order matters: burning first.
const HEAT_SECTIONS: { heat: Heat; label: string; icon: string }[] = [
  { heat: "burning", label: "On fire", icon: "🔥" },
  { heat: "soon", label: "Heating up", icon: "⏳" },
  { heat: "later", label: "Back burner", icon: "🧊" },
];

function Cat({ c }: { c: string | null }) {
  const m = meta(c);
  if (!m) return null;
  return (
    <span className="cat">
      <span className="cat-emoji">{m.icon}</span>
      {m.label}
    </span>
  );
}

export default async function Board() {
  const now = new Date();
  const items = await prisma.item.findMany({ where: { status: "open" } });
  const ranked = rankActionable(items, now);
  const parking = items.filter((i) => i.type === "parking");

  const hero = ranked[0] ?? null;
  // Everything below the hero, pre-numbered by overall rank, then split by heat.
  const numbered = ranked.slice(1).map((r, i) => ({ r, n: i + 2 }));
  const sections = HEAT_SECTIONS.map((s) => ({
    ...s,
    rows: numbered.filter((x) => x.r.heat === s.heat),
  }));

  const actionable = ranked.map((r) => r.item);

  const Row = ({ r, n }: { r: Ranked; n: number }) => {
    const i = r.item;
    return (
      <div className={`row heat-${r.heat}`}>
        <span className="rank">{n}</span>
        <div className="row-main">
          <div className="row-title">{i.title}</div>
          <div className="row-meta">
            <Cat c={i.category} />
            {i.deadline ? <span className={`dl dl-${r.heat}`}>{deadlineLabel(i.deadline, now)}</span> : null}
          </div>
        </div>
        {i.referee ? <span className="ref">{i.referee}</span> : null}
        <form action={markDone.bind(null, i.id)}>
          <button className="done" aria-label={i.type === "commitment" ? "honored this cycle" : "mark done"}>✓</button>
        </form>
        {i.type === "commitment" ? (
          <form action={retire.bind(null, i.id)}>
            <button className="del" aria-label="retire commitment" title="Retire for good">×</button>
          </form>
        ) : null}
      </div>
    );
  };

  const heroTell =
    hero && hero.heat === "burning"
      ? waLink(hero.item.referee, `Accountability check: I still need to "${hero.item.title}". Hold me to it.`)
      : null;

  return (
    <main className="wrap">
      <section className="cat-grid">
        {(Object.keys(CATEGORIES) as Category[]).map((cat) => {
          const m = CATEGORIES[cat];
          const inCat = actionable.filter((i) => i.category === cat);
          const dls = inCat.map((i) => i.deadline).filter((d): d is Date => !!d);
          const soonest = dls.length ? new Date(Math.min(...dls.map((d) => d.getTime()))) : null;
          const due = dueInLabel(soonest, now);
          return (
            <div className="cat-tile" key={cat} style={{ "--c": m.dot } as React.CSSProperties}>
              <span className="cat-ico">{m.icon}</span>
              <div className="cat-text">
                <div className="cat-name">
                  {m.label} <span className="cat-count">({inCat.length})</span>
                </div>
                <div className="cat-due">{due ?? ""}</div>
              </div>
            </div>
          );
        })}
      </section>

      {hero ? (
        <section className={`hero hero-${hero.heat}`}>
          <div className="hero-kicker">
            {hero.heat === "burning" ? "🔥 Burning · do this first" : "Top priority"}
          </div>
          <div className="hero-title">{hero.item.title}</div>
          <div className="hero-meta">
            <Cat c={hero.item.category} />
            {hero.item.deadline ? <span className="dl">{deadlineLabel(hero.item.deadline, now)}</span> : null}
            {hero.item.referee ? <span className="ref ref-hero">{hero.item.referee}</span> : null}
          </div>
          <div className="hero-actions">
            <form action={markDone.bind(null, hero.item.id)}>
              <button className="done-lg">{hero.item.type === "commitment" ? "Did it" : "Done"}</button>
            </form>
            {heroTell ? (
              <a className="tell" href={heroTell}>
                Tell {hero.item.referee}
              </a>
            ) : null}
            {hero.item.type === "commitment" ? (
              <form action={retire.bind(null, hero.item.id)}>
                <button className="retire-lg" title="Retire this commitment for good">Retire</button>
              </form>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="empty-state">Nothing on the list. Text the bot to add something.</section>
      )}

      {sections.map((s) =>
        s.rows.length ? (
          <section className={`sec sec-${s.heat}`} key={s.heat}>
            <h2 className="sec-head">
              <span className="sec-ico">{s.icon}</span>
              {s.label}
              <span className="sec-count">{s.rows.length}</span>
            </h2>
            <div className="feed">
              {s.rows.map(({ r, n }) => (
                <Row key={r.item.id} r={r} n={n} />
              ))}
            </div>
          </section>
        ) : null
      )}

      {parking.length ? (
        <details className="parking">
          <summary>Parking lot ({parking.length})</summary>
          <div className="feed">
            {parking.map((i) => (
              <div className="row heat-later" key={i.id}>
                <span className="rank">·</span>
                <div className="row-main">
                  <div className="row-title">{i.title}</div>
                  <div className="row-meta">
                    <Cat c={i.category} />
                  </div>
                </div>
                <form action={remove.bind(null, i.id)}>
                  <button className="del" aria-label="drop">×</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </main>
  );
}
