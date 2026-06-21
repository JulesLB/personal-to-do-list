import { prisma } from "@/lib/db";
import { hktDayStart, hktMonthStart, fmtUsd, fmtInt, fmtWhenHKT } from "@/lib/costs";
import s from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const SUM = {
  costUsd: true,
  inputTokens: true,
  outputTokens: true,
  cacheReadTokens: true,
  cacheCreateTokens: true,
} as const;

// Display metadata per tool (the `source` on each ApiUsage row). Keeps the
// dashboard human: a name, a one-line description, an icon. An unmapped source
// falls back to its raw key so a new tool still shows up.
const TOOLS: Record<string, { name: string; icon: string; desc: string }> = {
  classify: {
    name: "Capture & edit",
    icon: "💬",
    desc: "Turns each Telegram message or voice transcript into a structured item, or edits an existing one.",
  },
  coach: {
    name: "Weekly coach",
    icon: "🧭",
    desc: "The Review page read of your week and slipping items, in three beats. Runs on Refresh.",
  },
  transcribe: {
    name: "Voice notes",
    icon: "🎙️",
    desc: "Whisper transcribes a voice note before it's handed to capture.",
  },
};

type Summary = {
  today: number;
  month: number;
  all: number;
  tokensAll: number;
  allInput: number;
  allOutput: number;
  allCacheRead: number;
  allCacheCreate: number;
  tools: { source: string; cost: number; calls: number; perRun: number }[];
  byProvider: { provider: string; cost: number; calls: number }[];
  recent: {
    id: number;
    createdAt: Date;
    source: string;
    userId: number | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    latencyMs: number | null;
    costUsd: number;
    ok: boolean;
  }[];
};

// Returns null if the table isn't there yet (migration not run on this db), so
// the page shows a "run the migration" state instead of crashing.
async function loadSummary(now: Date): Promise<Summary | null> {
  try {
    const dayStart = hktDayStart(now);
    const monthStart = hktMonthStart(now);

    const [today, month, all, bySource, byProvider, recent] = await Promise.all([
      prisma.apiUsage.aggregate({ where: { createdAt: { gte: dayStart } }, _sum: SUM }),
      prisma.apiUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: SUM }),
      prisma.apiUsage.aggregate({ _sum: SUM }),
      prisma.apiUsage.groupBy({ by: ["source"], _sum: { costUsd: true }, _count: { _all: true } }),
      prisma.apiUsage.groupBy({ by: ["provider"], _sum: { costUsd: true }, _count: { _all: true } }),
      prisma.apiUsage.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    ]);

    const allInput = all._sum.inputTokens ?? 0;
    const allOutput = all._sum.outputTokens ?? 0;
    const allCacheRead = all._sum.cacheReadTokens ?? 0;
    const allCacheCreate = all._sum.cacheCreateTokens ?? 0;

    return {
      today: today._sum.costUsd ?? 0,
      month: month._sum.costUsd ?? 0,
      all: all._sum.costUsd ?? 0,
      tokensAll: allInput + allOutput + allCacheRead + allCacheCreate,
      allInput,
      allOutput,
      allCacheRead,
      allCacheCreate,
      tools: bySource
        .map((r) => {
          const cost = r._sum.costUsd ?? 0;
          const calls = r._count._all;
          return { source: r.source, cost, calls, perRun: calls > 0 ? cost / calls : 0 };
        })
        .sort((a, b) => b.cost - a.cost),
      byProvider: byProvider
        .map((r) => ({ provider: r.provider, cost: r._sum.costUsd ?? 0, calls: r._count._all }))
        .sort((a, b) => b.cost - a.cost),
      recent,
    };
  } catch {
    return null;
  }
}

function Header() {
  return (
    <>
      <div className={s.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Ember" width={32} height={32} className={s.logo} />
        <h1 className={s.brand}>Ember</h1>
        <span className={s.dashTitle}>Operational Dashboard</span>
      </div>
    </>
  );
}

export default async function AdminCostPage() {
  const now = new Date();
  const data = await loadSummary(now);

  if (!data) {
    return (
      <main className={s.page}>
        <Header />
        <div className={s.card}>
          <p className={s.empty}>
            No usage table found. Run <code>npm run db:migrate</code> (or deploy) to create it, then
            send a message to the bot to log the first call.
          </p>
        </div>
      </main>
    );
  }

  const cacheShare =
    data.tokensAll > 0 ? Math.round((data.allCacheRead / data.tokensAll) * 100) : 0;

  return (
    <main className={s.page}>
      <Header />

      {/* Headline numbers */}
      <div className={s.kpis}>
        <div className={s.kpi}>
          <span className={s.kpiIcon}>🕒</span>
          <div className={s.kpiLabel}>Today</div>
          <div className={s.kpiValue}>{fmtUsd(data.today)}</div>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiIcon}>🗓️</span>
          <div className={s.kpiLabel}>This month</div>
          <div className={s.kpiValue}>{fmtUsd(data.month)}</div>
        </div>
        <div className={`${s.kpi} ${s.kpiAccent}`}>
          <span className={s.kpiIcon}>💵</span>
          <div className={s.kpiLabel}>All time</div>
          <div className={s.kpiValue}>{fmtUsd(data.all)}</div>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiIcon}>🪙</span>
          <div className={s.kpiLabel}>Tokens</div>
          <div className={s.kpiValue}>{fmtInt(data.tokensAll)}</div>
          <div className={s.kpiSub}>{cacheShare}% served from cache</div>
        </div>
      </div>

      {/* Per-tool breakdown */}
      <section className={s.section}>
        <div className={s.sectionTitle}>🛠️ Tools</div>
        <div className={s.toolGrid}>
          {data.tools.length === 0 ? (
            <div className={s.card}>
              <p className={s.empty}>No calls logged yet.</p>
            </div>
          ) : (
            data.tools.map((t) => {
              const meta = TOOLS[t.source] ?? { name: t.source, icon: "⚙️", desc: "" };
              return (
                <div key={t.source} className={s.toolCard}>
                  <div className={s.toolChip}>{meta.icon}</div>
                  <div className={s.toolBody}>
                    <p className={s.toolName}>{meta.name}</p>
                    {meta.desc ? <p className={s.toolDesc}>{meta.desc}</p> : null}
                    <div className={s.toolStats}>
                      <div>
                        <div className={`${s.statVal} ${s.statValAccent}`}>{fmtUsd(t.perRun)}</div>
                        <div className={s.statLabel}>per run</div>
                      </div>
                      <div>
                        <div className={s.statVal}>{fmtInt(t.calls)}</div>
                        <div className={s.statLabel}>runs</div>
                      </div>
                      <div>
                        <div className={s.statVal}>{fmtUsd(t.cost)}</div>
                        <div className={s.statLabel}>total</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Provider + token split, boxed */}
      <section className={s.section}>
        <div className={s.cols}>
          <div className={s.card}>
            <div className={s.cardHead}>☁️ By provider</div>
            {data.byProvider.length === 0 ? (
              <p className={s.empty}>No calls logged yet.</p>
            ) : (
              data.byProvider.map((p) => (
                <div key={p.provider} className={s.row}>
                  <span className={s.rowLabel}>
                    {p.provider}
                    <span className={s.rowSub}>{fmtInt(p.calls)} calls</span>
                  </span>
                  <span className={s.rowVal}>{fmtUsd(p.cost)}</span>
                </div>
              ))
            )}
          </div>

          <div className={s.card}>
            <div className={s.cardHead}>🔤 Tokens (all time)</div>
            <div className={s.row}>
              <span className={s.rowLabel}>Input</span>
              <span className={s.rowVal}>{fmtInt(data.allInput)}</span>
            </div>
            <div className={s.row}>
              <span className={s.rowLabel}>Output</span>
              <span className={s.rowVal}>{fmtInt(data.allOutput)}</span>
            </div>
            <div className={s.row}>
              <span className={s.rowLabel}>
                Cache reads<span className={s.rowSub}>{cacheShare}% of all</span>
              </span>
              <span className={s.rowVal}>{fmtInt(data.allCacheRead)}</span>
            </div>
            <div className={s.row}>
              <span className={s.rowLabel}>Cache writes</span>
              <span className={s.rowVal}>{fmtInt(data.allCacheCreate)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Recent calls */}
      <section className={s.section}>
        <div className={s.sectionTitle}>🧾 Recent calls</div>
        <div className={s.card}>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>When (HKT)</th>
                  <th className={s.th}>Tool</th>
                  <th className={s.th}>User</th>
                  <th className={s.thR}>In</th>
                  <th className={s.thR}>Out</th>
                  <th className={s.thR}>Cache</th>
                  <th className={s.thR}>ms</th>
                  <th className={s.thR}>Cost</th>
                  <th className={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td className={s.td} colSpan={9}>
                      <span className={s.empty}>No calls logged yet.</span>
                    </td>
                  </tr>
                ) : (
                  data.recent.map((r) => {
                    const meta = TOOLS[r.source] ?? { name: r.source, icon: "⚙️", desc: "" };
                    return (
                      <tr key={r.id} className={s.tr}>
                        <td className={s.td}>{fmtWhenHKT(r.createdAt)}</td>
                        <td className={s.td}>
                          {meta.icon} {meta.name}
                        </td>
                        <td className={s.td}>{r.userId ?? "·"}</td>
                        <td className={s.tdR}>{fmtInt(r.inputTokens)}</td>
                        <td className={s.tdR}>{fmtInt(r.outputTokens)}</td>
                        <td className={s.tdR}>{fmtInt(r.cacheReadTokens)}</td>
                        <td className={s.tdR}>{r.latencyMs ?? "·"}</td>
                        <td className={s.tdR}>{fmtUsd(r.costUsd)}</td>
                        <td className={s.td}>
                          <span className={r.ok ? s.dotOk : s.dotBad} title={r.ok ? "ok" : "error"} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
