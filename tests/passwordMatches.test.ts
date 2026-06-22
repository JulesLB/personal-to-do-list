import { describe, it, expect } from "vitest";
import { passwordMatches } from "../src/lib/auth";

// passwordMatches HMACs both sides and compares the digests in constant time, so
// it's the right primitive for the board/admin password and the Telegram webhook
// secret. These cover correctness; the constant-time property is structural.
const SECRET = "a-long-random-secret-value";

describe("passwordMatches", () => {
  it("accepts the exact secret", async () => {
    expect(await passwordMatches(SECRET, SECRET)).toBe(true);
  });

  it("rejects a wrong value of the same length", async () => {
    const wrong = "a-long-random-secret-valuX".slice(0, SECRET.length);
    expect(wrong.length).toBe(SECRET.length);
    expect(await passwordMatches(wrong, SECRET)).toBe(false);
  });

  it("rejects a value of a different length", async () => {
    expect(await passwordMatches("short", SECRET)).toBe(false);
    expect(await passwordMatches(SECRET + "extra", SECRET)).toBe(false);
  });

  it("rejects an empty input", async () => {
    expect(await passwordMatches("", SECRET)).toBe(false);
  });
});
