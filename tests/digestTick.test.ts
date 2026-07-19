import { describe, it, expect, vi, beforeEach } from "vitest";
import { make } from "./factory";
import type { Item, User } from "@prisma/client";

// runDigestTick reads users + their items straight from Prisma, so the DB is the
// only thing to stub. The sender is injectable. The point of these tests: the tick
// fires each user's 08:00 / 20:00 digest on THEIR local clock, exactly once a day.
const db = vi.hoisted(() => ({
  user: { findMany: vi.fn(), update: vi.fn() },
  item: { findMany: vi.fn(), update: vi.fn() },
  event: { create: vi.fn(), findFirst: vi.fn() },
  referee: { findUnique: vi.fn() },
}));

vi.mock("../src/lib/db", () => ({ prisma: db }));

import { runDigestTick } from "../src/lib/sweep";

const DAY = 86400000;
const overdue = (): Item => make({ id: 1, deadline: new Date(Date.now() - DAY) });

const user = (over: Partial<User>): User =>
  ({
    id: 1,
    telegramChatId: "100",
    name: "T",
    email: null,
    timezone: "Asia/Hong_Kong",
    onboardingStep: "done",
    lastMorningNudgeOn: null,
    lastEveningNudgeOn: null,
    createdAt: new Date(),
    ...over,
  }) as User;

// 00:30 UTC = 08:30 HKT (morning), 20:30 the prior day in New York (evening),
// 01:30 in London (neither window).
const NOW = new Date("2026-06-30T00:30:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.item.findMany.mockResolvedValue([overdue()]);
  db.item.update.mockResolvedValue(undefined);
  db.user.update.mockResolvedValue(undefined);
  db.event.create.mockResolvedValue(undefined);
  db.event.findFirst.mockResolvedValue(null);
  db.referee.findUnique.mockResolvedValue(null);
});

describe("runDigestTick", () => {
  it("fires the morning digest only inside the user's local 8am window", async () => {
    db.user.findMany.mockResolvedValue([
      user({ id: 1, telegramChatId: "hk", timezone: "Asia/Hong_Kong" }), // 08:30 → morning
      user({ id: 3, telegramChatId: "ldn", timezone: "Europe/London" }), // 01:30 → nothing
    ]);
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await runDigestTick(NOW, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("hk");
    expect(res.sent).toBe(1);
    // The London user is gated out before any write.
    const updatedIds = db.user.update.mock.calls.map((c) => c[0].where.id);
    expect(updatedIds).toEqual([1]);
  });

  it("fires the evening digest for a user whose local clock is 8pm", async () => {
    db.user.findMany.mockResolvedValue([
      user({ id: 2, telegramChatId: "ny", timezone: "America/New_York" }), // 20:30 → evening
    ]);
    const send = vi.fn().mockResolvedValue(undefined);

    await runDigestTick(NOW, send);

    expect(send).toHaveBeenCalledTimes(1);
    // The marker is stamped with the user's LOCAL date (the 29th in New York).
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { lastEveningNudgeOn: "2026-06-29" },
    });
  });

  it("stamps the morning marker with the local date", async () => {
    db.user.findMany.mockResolvedValue([user({ id: 1, telegramChatId: "hk" })]);
    const send = vi.fn().mockResolvedValue(undefined);

    await runDigestTick(NOW, send);

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastMorningNudgeOn: "2026-06-30" },
    });
  });

  it("does not re-send once today's marker is already set", async () => {
    db.user.findMany.mockResolvedValue([
      user({ id: 1, telegramChatId: "hk", lastMorningNudgeOn: "2026-06-30" }),
    ]);
    const send = vi.fn().mockResolvedValue(undefined);

    const res = await runDigestTick(NOW, send);

    expect(send).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
    expect(res.sent).toBe(0);
  });
});
