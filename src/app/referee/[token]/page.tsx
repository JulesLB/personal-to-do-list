import { prisma } from "@/lib/db";
import { verifyRefereeToken } from "@/lib/auth";
import { sendMessage } from "@/lib/telegram";
import { daysOverdue, commitmentDueLabel, deadlineLabel } from "@/lib/rank";
import { ownerUser } from "@/lib/user";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const OWNER = process.env.OWNER_NAME || "Jules";

// A referee's no-account view: only the items they hold the owner to, and only
// once those are overdue. One button: poke the owner. The token is re-verified
// inside the action, so a stale or forged form can't fire a poke.
export default async function RefereePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ poked?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const label = await verifyRefereeToken(token, process.env.APP_SECRET ?? "");

  if (!label) {
    return (
      <main style={wrap}>
        <div style={card}>
          <h1 style={brand}>Ember</h1>
          <p style={muted}>This link is invalid or expired. Ask {OWNER} for a fresh one.</p>
        </div>
      </main>
    );
  }

  const now = new Date();
  // PRD-10 bridge: the referee token carries only the label, so scope to the
  // owner (first user). True multi-user referee links need the userId in the
  // token — a PRD-11 / M2b follow-up.
  const owner = await ownerUser();
  const overdue = (
    owner
      ? await prisma.item.findMany({ where: { status: "open", referee: label, userId: owner.id } })
      : []
  )
    .filter((i) => i.type !== "parking" && daysOverdue(i, now) > 0)
    .sort((a, b) => daysOverdue(b, now) - daysOverdue(a, now));

  async function poke(formData: FormData) {
    "use server";
    const tok = String(formData.get("token") ?? "");
    const itemId = Number(formData.get("itemId"));
    const lbl = await verifyRefereeToken(tok, process.env.APP_SECRET ?? "");
    if (!lbl || !Number.isFinite(itemId)) return;
    const ownr = await ownerUser();
    if (!ownr) return;
    const item = await prisma.item.findFirst({ where: { id: itemId, userId: ownr.id } });
    if (!item || item.referee !== lbl || item.status !== "open") return;
    await sendMessage(
      ownr.telegramChatId,
      `👀 Your ${lbl} just poked you: "${item.title}" is overdue and they can see it. Get it done.`
    );
    await prisma.event.create({ data: { itemId, kind: "poked" } }).catch(() => {});
    redirect(`/referee/${tok}?poked=1`);
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={brand}>Ember</h1>
        <p style={muted}>
          {OWNER} asked you to hold them accountable. Here&apos;s what they&apos;ve let slip.
        </p>

        {sp.poked && <p style={confirm}>Poked. {OWNER} just heard about it.</p>}

        {overdue.length === 0 ? (
          <p style={{ ...muted, marginTop: 24 }}>
            Nothing overdue right now. {OWNER} is keeping their word. You&apos;re off duty.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
            {overdue.map((item) => (
              <li key={item.id} style={row}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={due}>
                    {item.type === "commitment"
                      ? commitmentDueLabel(item, now)
                      : deadlineLabel(item.deadline, now)}
                  </div>
                </div>
                <form action={poke}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button type="submit" style={pokeBtn}>
                    Poke {OWNER}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "#f6f5f1",
};
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "#fff",
  borderRadius: 16,
  padding: 28,
  boxShadow: "0 1px 3px rgba(0,0,0,.08)",
};
const brand: React.CSSProperties = { margin: 0, fontSize: 26, color: "#d8542e" };
const muted: React.CSSProperties = { color: "#6b6a64", marginTop: 8, lineHeight: 1.5 };
const confirm: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#fdeee7",
  color: "#b34218",
  fontWeight: 600,
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 0",
  borderTop: "1px solid #eceae3",
};
const due: React.CSSProperties = { color: "#d8542e", fontSize: 14, marginTop: 2 };
const pokeBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  background: "#d8542e",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
