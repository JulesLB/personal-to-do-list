import { describe, it, expect, vi, beforeEach } from "vitest";
import { make } from "./factory";
import type { Item, Referee, User } from "@prisma/client";

// runSweep talks straight to Prisma, so the DB is the only thing to stub. The
// sender is injectable, so we pass a fake to capture sends without Telegram.
// PRD-10: the sweep loops users, so user.findMany is stubbed too, and referees
// come from the Referee table (referee.findUnique), not env vars.
const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  item: { findMany: vi.fn(), update: vi.fn() },
  event: { create: vi.fn(), findFirst: vi.fn() },
  referee: { findUnique: vi.fn() },
}));

vi.mock("../src/lib/db", () => ({ prisma: db }));

import { runSweep } from "../src/lib/sweep";

const USER: User = {
  id: 1,
  telegramChatId: "999",
  name: "Jules",
  email: null,
  timezone: "Asia/Hong_Kong",
  createdAt: new Date(),
};

const DAY = 86400000;
const overdue = (): Item => make({ id: 1, deadline: new Date(Date.now() - DAY) });
// Critical (3+ days overdue), important, with a referee assigned.
const criticalWithReferee = (): Item =>
  make({ id: 1, title: "File taxes", deadline: new Date(Date.now() - 5 * DAY), referee: "wife" });

// A referee row that is opted in: a real contact and consent on.
const optedInRef: Referee = {
  id: 1,
  userId: 1,
  label: "wife",
  relation: null,
  channel: "whatsapp",
  contact: "+85291234567",
  consent: true,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([USER]);
  db.item.update.mockResolvedValue(undefined);
  db.event.create.mockResolvedValue(undefined);
  db.event.findFirst.mockResolvedValue(null);
  db.referee.findUnique.mockResolvedValue(null);
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
  delete process.env.WHATSAPP_TEMPLATE;
});

describe("runSweep", () => {
  it("morning sends nothing when nothing is due (M0a: no empty-state ping)", async () => {
    db.item.findMany.mockResolvedValue([]);
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await runSweep("morning", send);

    expect(send).not.toHaveBeenCalled();
    expect(res).toEqual({ sent: 0, users: 1 });
    // No accountability writes on a silent sweep.
    expect(db.item.update).not.toHaveBeenCalled();
    expect(db.event.create).not.toHaveBeenCalled();
  });

  it("evening stays silent when nothing is due (unchanged)", async () => {
    db.item.findMany.mockResolvedValue([]);
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await runSweep("evening", send);

    expect(send).not.toHaveBeenCalled();
    expect(res.sent).toBe(0);
  });

  it("morning still sends when something is pressing", async () => {
    db.item.findMany.mockResolvedValue([overdue()]);
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await runSweep("morning", send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("999"); // sent to the user's chat
    expect(res.sent).toBe(1);
    // The pressing item gets its accountability memory bumped.
    expect(db.item.update).toHaveBeenCalledTimes(1);
    expect(db.event.create).toHaveBeenCalledTimes(1);
  });

  it("warns first when a critical item has an opted-in referee", async () => {
    db.item.findMany.mockResolvedValue([criticalWithReferee()]);
    db.referee.findUnique.mockResolvedValue(optedInRef);
    const send = vi.fn().mockResolvedValue(undefined);

    await runSweep("morning", send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].toLowerCase()).toContain("last warning");
    // nudged + escalation_warned written; no told_referee yet.
    const kinds = db.event.create.mock.calls.map((c) => c[0].data.kind);
    expect(kinds).toContain("escalation_warned");
    expect(kinds).not.toContain("told_referee");
  });

  it("degrades to the one-tap draft past the warning when WhatsApp is unset", async () => {
    db.item.findMany.mockResolvedValue([criticalWithReferee()]);
    db.referee.findUnique.mockResolvedValue(optedInRef);
    // The warning already went out this cycle.
    db.event.findFirst.mockImplementation(({ where }: { where: { kind: string } }) =>
      Promise.resolve(where.kind === "escalation_warned" ? { id: 1 } : null)
    );
    const send = vi.fn().mockResolvedValue(undefined);

    await runSweep("morning", send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].toLowerCase()).toContain("isn't set up");
    const kinds = db.event.create.mock.calls.map((c) => c[0].data.kind);
    expect(kinds).not.toContain("told_referee");
  });
});
