import { describe, it, expect, vi, beforeEach } from "vitest";
import { make } from "./factory";
import type { Item } from "@prisma/client";

// runSweep talks straight to Prisma, so the DB is the only thing to stub. The
// sender is injectable, so we pass a fake to capture sends without Telegram.
const db = vi.hoisted(() => ({
  setting: { findUnique: vi.fn() },
  item: { findMany: vi.fn(), update: vi.fn() },
  event: { create: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("../src/lib/db", () => ({ prisma: db }));

import { runSweep } from "../src/lib/sweep";

const overdue = (): Item => make({ id: 1, deadline: new Date(Date.now() - 86400000) });
// Critical (3+ days overdue), important, with an opted-in referee.
const DAY = 86400000;
const criticalWithReferee = (): Item =>
  make({ id: 1, title: "File taxes", deadline: new Date(Date.now() - 5 * DAY), referee: "wife" });

beforeEach(() => {
  vi.clearAllMocks();
  db.setting.findUnique.mockResolvedValue({ key: "ownerChatId", value: "999" });
  db.item.update.mockResolvedValue(undefined);
  db.event.create.mockResolvedValue(undefined);
  db.event.findFirst.mockResolvedValue(null);
  // A referee is only "opted in" with a real number; default it on for the
  // escalation tests, off otherwise.
  delete process.env.WIFE_WHATSAPP;
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
    expect(res).toEqual({ sent: 0, chatId: "999", topId: null });
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
    expect(res.sent).toBe(1);
    expect(res.topId).toBe(1);
    // The pressing item gets its accountability memory bumped.
    expect(db.item.update).toHaveBeenCalledTimes(1);
    expect(db.event.create).toHaveBeenCalledTimes(1);
  });

  it("warns first when a critical item has an opted-in referee", async () => {
    process.env.WIFE_WHATSAPP = "+85291234567";
    db.item.findMany.mockResolvedValue([criticalWithReferee()]);
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
    process.env.WIFE_WHATSAPP = "+85291234567";
    db.item.findMany.mockResolvedValue([criticalWithReferee()]);
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
