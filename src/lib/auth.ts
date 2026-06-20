// Board session auth. The cookie must NOT be the password: instead it carries a
// signed token (HMAC of an expiry, keyed by APP_SECRET) so a leaked cookie never
// reveals the secret, the session expires on its own, and rotating APP_SECRET
// invalidates every outstanding token. Uses Web Crypto so it runs in both the
// Edge middleware and the Node login route.

const COOKIE = "app_auth";
const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = SESSION_TTL_SEC;

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toB64Url(new Uint8Array(sig));
}

// Constant-time compare. Equal-length signatures here, so a length mismatch only
// ever means a malformed token.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Constant-time password check. Comparing HMAC digests (fixed 32 bytes) instead
// of the raw strings keeps it constant-time and stops the length of the secret
// from leaking through an early-exit length mismatch.
export async function passwordMatches(input: string, secret: string): Promise<boolean> {
  const k = "ember-pw-check";
  return safeEqual(await hmac(k, input), await hmac(k, secret));
}

// token = "<expiryEpochSec>.<hmac(secret, expiry)>"
export async function createSessionToken(secret: string): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SEC);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (!safeEqual(sig, await hmac(secret, exp))) return false;
  return Number(exp) > Math.floor(Date.now() / 1000);
}
