import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  createLoginLinkToken,
  verifyLoginLinkToken,
} from "../src/lib/auth";

const SECRET = "test-secret";

describe("session + login-link tokens (PRD-11)", () => {
  it("round-trips a session token and returns the userId", async () => {
    const token = await createSessionToken(42, SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe(42);
  });

  it("round-trips a login-link token and returns the userId", async () => {
    const token = await createLoginLinkToken(7, SECRET);
    expect(await verifyLoginLinkToken(token, SECRET)).toBe(7);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken(42, SECRET);
    const forged = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(await verifySessionToken(forged, SECRET)).toBeNull();
  });

  it("rejects a different secret", async () => {
    const token = await createSessionToken(42, SECRET);
    expect(await verifySessionToken(token, "other-secret")).toBeNull();
  });

  // The whole point of domain separation: a short-lived login link must not be
  // usable as a long-lived session, and a session must not pass as a login link.
  it("does not accept a login-link token as a session", async () => {
    const login = await createLoginLinkToken(42, SECRET);
    expect(await verifySessionToken(login, SECRET)).toBeNull();
  });

  it("does not accept a session token as a login link", async () => {
    const session = await createSessionToken(42, SECRET);
    expect(await verifyLoginLinkToken(session, SECRET)).toBeNull();
  });

  it("rejects a token whose userId was swapped", async () => {
    const token = await createSessionToken(42, SECRET);
    const swapped = token.replace(/^42\./, "99.");
    expect(await verifySessionToken(swapped, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBeNull();
    expect(await verifySessionToken("nonsense", SECRET)).toBeNull();
    expect(await verifySessionToken("a.b", SECRET)).toBeNull();
    expect(await verifySessionToken("notanumber.123.sig", SECRET)).toBeNull();
  });
});
