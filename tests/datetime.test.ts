import { describe, it, expect } from "vitest";
import {
  isoDate,
  timeOfDay,
  hourInTz,
  dayNumber,
  startOfDay,
  deadlineInstant,
  timeInstant,
  isValidTimeZone,
  nowLabel,
} from "../src/lib/datetime";
import { make } from "./factory";
import { dueInLabel, daysOverdue } from "../src/lib/rank";

// 00:30 UTC: morning in HK, the previous evening in New York, small hours in London.
const T = new Date("2026-06-30T00:30:00Z");

describe("datetime: local parts across zones", () => {
  it("reads the local date per zone", () => {
    expect(isoDate(T, "Asia/Hong_Kong")).toBe("2026-06-30");
    expect(isoDate(T, "America/New_York")).toBe("2026-06-29"); // still the 29th there
    expect(isoDate(T, "Europe/London")).toBe("2026-06-30");
  });

  it("reads the local clock time and hour per zone", () => {
    expect(timeOfDay(T, "Asia/Hong_Kong")).toBe("08:30");
    expect(hourInTz(T, "Asia/Hong_Kong")).toBe(8);
    expect(hourInTz(T, "America/New_York")).toBe(20); // 20:30 EDT
    expect(hourInTz(T, "Europe/London")).toBe(1);
  });

  it("defaults to Hong Kong when no zone is given", () => {
    expect(isoDate(T)).toBe("2026-06-30");
    expect(hourInTz(T)).toBe(8);
  });
});

describe("datetime: calendar-day math", () => {
  it("counts whole calendar days between instants, DST-safe", () => {
    const a = new Date("2026-03-01T12:00:00Z");
    const b = new Date("2026-03-31T12:00:00Z"); // spans the UK DST change
    expect(dayNumber(b, "Europe/London") - dayNumber(a, "Europe/London")).toBe(30);
  });

  it("startOfDay lands on local midnight", () => {
    // 00:30 UTC is 08:30 in HK, so the HK day started at 00:00 HK = 16:00 UTC prior day.
    expect(startOfDay(T, "Asia/Hong_Kong").toISOString()).toBe("2026-06-29T16:00:00.000Z");
  });
});

describe("datetime: building stored instants", () => {
  it("deadlineInstant is 09:00 local, honoring DST", () => {
    // HK has no DST: 09:00 HKT = 01:00 UTC year-round.
    expect(deadlineInstant("2026-07-01", "Asia/Hong_Kong").toISOString()).toBe(
      "2026-07-01T01:00:00.000Z"
    );
    // London: 09:00 GMT in winter (09:00 UTC), 09:00 BST in summer (08:00 UTC).
    expect(deadlineInstant("2026-01-01", "Europe/London").toISOString()).toBe(
      "2026-01-01T09:00:00.000Z"
    );
    expect(deadlineInstant("2026-07-01", "Europe/London").toISOString()).toBe(
      "2026-07-01T08:00:00.000Z"
    );
  });

  it("timeInstant is the given clock time local", () => {
    expect(timeInstant("2026-07-01", "18:30", "America/New_York").toISOString()).toBe(
      "2026-07-01T22:30:00.000Z" // 18:30 EDT = 22:30 UTC
    );
  });
});

describe("datetime: zone validation + label", () => {
  it("accepts real IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Mars/Phobos")).toBe(false);
    expect(isValidTimeZone("not-a-zone")).toBe(false);
  });

  it("nowLabel carries the zone so the classifier resolves in local time", () => {
    expect(nowLabel(T, "Asia/Hong_Kong")).toBe("2026-06-30 08:30 (Tuesday) Asia/Hong_Kong");
  });
});

describe("rank labels follow the user's timezone", () => {
  // A deadline stored at 09:00 HKT on 30 Jun (01:00 UTC).
  const item = make({ deadline: new Date("2026-06-30T01:00:00Z") });
  // 14:00 UTC: 22:00 the 30th in HK, but only 04:00 the 30th in Honolulu, where the
  // deadline instant already fell on the 29th.
  const now = new Date("2026-06-30T14:00:00Z");

  it("reads 'due today' in Hong Kong but overdue in Honolulu", () => {
    expect(dueInLabel(item.deadline, now, "Asia/Hong_Kong")).toBe("due today");
    expect(daysOverdue(item, now, "Asia/Hong_Kong")).toBe(0);
    expect(dueInLabel(item.deadline, now, "Pacific/Honolulu")).toBe("1d overdue");
    expect(daysOverdue(item, now, "Pacific/Honolulu")).toBe(1);
  });
});
