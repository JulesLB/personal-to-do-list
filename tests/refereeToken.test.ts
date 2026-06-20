import { describe, it, expect } from "vitest";
import { createRefereeToken, verifyRefereeToken } from "../src/lib/auth";

const SECRET = "test-secret";

describe("referee token", () => {
  it("round-trips a valid label", async () => {
    const token = await createRefereeToken("wife", SECRET);
    expect(await verifyRefereeToken(token, SECRET)).toBe("wife");
  });

  it("rejects a tampered signature", async () => {
    const token = await createRefereeToken("wife", SECRET);
    const forged = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(await verifyRefereeToken(forged, SECRET)).toBeNull();
  });

  it("rejects a different secret", async () => {
    const token = await createRefereeToken("wife", SECRET);
    expect(await verifyRefereeToken(token, "other-secret")).toBeNull();
  });

  it("rejects a relabeled token", async () => {
    const token = await createRefereeToken("wife", SECRET);
    const swapped = token.replace(/^wife\./, "sister.");
    expect(await verifyRefereeToken(swapped, SECRET)).toBeNull();
  });

  it("rejects a correctly-signed but expired token", async () => {
    const past = String(Math.floor(Date.now() / 1000) - 10);
    const expired = await buildExpired("wife", past, SECRET);
    expect(await verifyRefereeToken(expired, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyRefereeToken(undefined, SECRET)).toBeNull();
    expect(await verifyRefereeToken("nonsense", SECRET)).toBeNull();
    expect(await verifyRefereeToken("a.b", SECRET)).toBeNull();
  });
});

// Sign a payload with a past expiry using the same HMAC the module uses, so the
// signature is valid and only the expiry check can reject it.
async function buildExpired(label: string, exp: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const payload = `${label}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${payload}.${b64}`;
}
