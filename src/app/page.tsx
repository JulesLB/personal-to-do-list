import { prisma } from "@/lib/db";
import { markDone, toggleImportant, toggleUrgent, remove } from "./actions";

export const dynamic = "force-dynamic";

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function Board() {
  const items = await prisma.item.findMany({
    where: { status: "open" },
    orderBy: { id: "asc" },
  });

  const inQuad = (imp: boolean, urg: boolean) =>
    items.filter((i) => i.type !== "parking" && i.important === imp && i.urgent === urg);
  const parking = items.filter((i) => i.type === "parking");

  const Card = ({ i }: { i: (typeof items)[number] }) => (
    <div className="card">
      <div className="card-title">{i.title}</div>
      <div className="card-meta">
        #{i.id} · {i.type}
        {i.deadline ? ` · by ${isoDate(i.deadline)}` : ""}
        {i.referee ? ` · ${i.referee}` : ""}
      </div>
      <div className="card-actions">
        <form action={markDone.bind(null, i.id)}>
          <button className="done">done</button>
        </form>
        <form action={toggleImportant.bind(null, i.id, !i.important)}>
          <button>{i.important ? "−imp" : "+imp"}</button>
        </form>
        <form action={toggleUrgent.bind(null, i.id, !i.urgent)}>
          <button>{i.urgent ? "−urg" : "+urg"}</button>
        </form>
        <form action={remove.bind(null, i.id)}>
          <button className="del">×</button>
        </form>
      </div>
    </div>
  );

  const Quad = ({
    title,
    imp,
    urg,
    hint,
  }: {
    title: string;
    imp: boolean;
    urg: boolean;
    hint: string;
  }) => {
    const list = inQuad(imp, urg);
    return (
      <section className="quad">
        <h2>
          {title} <span className="hint">{hint}</span>
        </h2>
        {list.map((i) => (
          <Card key={i.id} i={i} />
        ))}
        {list.length === 0 ? <p className="empty">empty</p> : null}
      </section>
    );
  };

  return (
    <main className="wrap">
      <header className="top">
        <h1>HERMES</h1>
        <p>{items.length} open · text the bot to add</p>
      </header>
      <div className="grid">
        <Quad title="Do now" imp={true} urg={true} hint="important + urgent" />
        <Quad title="Schedule" imp={true} urg={false} hint="important, not urgent — the death zone" />
        <Quad title="Delegate" imp={false} urg={true} hint="urgent, not important" />
        <Quad title="Drop" imp={false} urg={false} hint="neither" />
      </div>
      {parking.length > 0 ? (
        <section className="parking">
          <h2>Parking lot</h2>
          {parking.map((i) => (
            <Card key={i.id} i={i} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
