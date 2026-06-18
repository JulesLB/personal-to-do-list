import { prisma } from "@/lib/db";
import { markDone, remove } from "./actions";
import { rankActionable, deadlineLabel, CATEGORIES, type Category, type Ranked } from "@/lib/rank";
import { waLink } from "@/lib/waLink";

export const dynamic = "force-dynamic";

const meta = (c: string | null) => (c && c in CATEGORIES ? CATEGORIES[c as Category] : null);

function Cat({ c }: { c: string | null }) {
  const m = meta(c);
  if (!m) return null;
  return (
    <span className="cat">
      <span className="dot" style={{ background: m.dot }} />
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
  const rest = ranked.slice(1);
  const top = rest.slice(0, 4);
  const more = rest.slice(4);

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
          <button className="done" aria-label="mark done">✓</button>
        </form>
      </div>
    );
  };

  const heroTell =
    hero && hero.heat === "burning"
      ? waLink(hero.item.referee, `Accountability check: I still need to "${hero.item.title}". Hold me to it.`)
      : null;

  return (
    <main className="wrap">
      <header className="top">
        <h1>Hermes</h1>
        <p>{ranked.length} on the list · text the bot to add</p>
      </header>

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
              <button className="done-lg">Done</button>
            </form>
            {heroTell ? (
              <a className="tell" href={heroTell}>
                Tell {hero.item.referee}
              </a>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="empty-state">Nothing on the list. Text the bot to add something.</section>
      )}

      <div className="feed">
        {top.map((r, idx) => (
          <Row key={r.item.id} r={r} n={idx + 2} />
        ))}
      </div>

      {more.length ? (
        <details className="more">
          <summary>Show all {ranked.length}</summary>
          <div className="feed">
            {more.map((r, idx) => (
              <Row key={r.item.id} r={r} n={idx + 6} />
            ))}
          </div>
        </details>
      ) : null}

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
