import { describe, it, expect, vi, beforeEach } from "vitest";
import { make } from "./factory";
import type { Item } from "@prisma/client";

// runSweep talks straight to Prisma, so the DB is the only thing to stub. The
// sender is injectable, so we pass a fake to capture sends without Telegram.
const db = vi.hoisted(() => ({
  setting: { findUnique: vi.fn() },
  item: { findMany: vi.fn(), update: vi.fn() },
  event: { create: vi.fn() },
}));

vi.mock("../src/lib/db", () => ({ prisma: db }));

import { runSweep } from "../src/lib/sweep";

const overdue = (): Item => make({ id: 1, deadline: new Date(Date.now() - 86400000) });

beforeEach(() => {
  vi.clearAllMocks();
  db.setting.findUnique.mockResolvedValue({ key: "ownerChatId", value: "999" });
  db.item.update.mockResolvedValue(undefined);
  db.event.create.mockResolvedValue(undefined);
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
});
