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

// Session token (PRD-11): carries the user id so the board knows who's logged in.
// Three dot-parts "<userId>.<exp>.<sig>"; the signature is domain-separated with a
// "session" prefix so it can't be swapped with a login-link or referee token even
// though they share a shape. Returns the userId, or null if invalid/expired.
export async function createSessionToken(userId: number, secret: string): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SEC);
  const payload = `${userId}.${exp}`;
  return `${payload}.${await hmac(secret, `session.${payload}`)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<number | null> {
  return verifyIdToken(token, secret, "session");
}

// Login-link token (PRD-11): short-lived (10 min) token the bot mints and texts
// to the user; opening /login/<token> exchanges it for a session cookie.
const LOGIN_LINK_TTL_SEC = 60 * 10;

export async function createLoginLinkToken(userId: number, secret: string): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + LOGIN_LINK_TTL_SEC);
  const payload = `${userId}.${exp}`;
  return `${payload}.${await hmac(secret, `login.${payload}`)}`;
}

export async function verifyLoginLinkToken(
  token: string | undefined,
  secret: string
): Promise<number | null> {
  return verifyIdToken(token, secret, "login");
}

// Shared verifier for the two "<userId>.<exp>.<sig>" tokens. The `kind` namespaces
// the HMAC so a login link can't be replayed as a long-lived session and vice versa.
async function verifyIdToken(
  token: string | undefined,
  secret: string,
  kind: "session" | "login"
): Promise<number | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  if (!/^\d+$/.test(uid) || !/^\d+$/.test(exp)) return null;
  if (!safeEqual(sig, await hmac(secret, `${kind}.${uid}.${exp}`))) return null;
  if (Number(exp) <= Math.floor(Date.now() / 1000)) return null;
  return Number(uid);
}

// Back-office (ops console) session. Gated by its own ADMIN_SECRET, separate from
// the board password, so a board login never reaches /admin. Single shared secret,
// not per-user: token shape "<exp>.<sig>", domain-separated with an "admin" prefix
// so it can't be swapped with a session/login/referee token. Rotating ADMIN_SECRET
// invalidates every admin session.
const ADMIN_COOKIE = "admin_auth";
const ADMIN_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export const ADMIN_SESSION_COOKIE = ADMIN_COOKIE;
export const ADMIN_SESSION_MAX_AGE = ADMIN_TTL_SEC;

export async function createAdminToken(secret: string): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + ADMIN_TTL_SEC);
  return `${exp}.${await hmac(secret, `admin.${exp}`)}`;
}

export async function verifyAdminToken(
  token: string | undefined,
  secret: string
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [exp, sig] = parts;
  if (!/^\d+$/.test(exp)) return false;
  if (!safeEqual(sig, await hmac(secret, `admin.${exp}`))) return false;
  if (Number(exp) <= Math.floor(Date.now() / 1000)) return false;
  return true;
}

// Referee links (M2b): a referee gets a signed, no-account URL that shows only
// the items they referee. The token carries the referee label, signed and
// expiring like the session token, so no row or password is needed. Three
// dot-parts ("<label>.<exp>.<sig>") vs the session token's two keeps them
// distinct. Reuses APP_SECRET, so rotating it invalidates referee links too.
const REFEREE_TTL_SEC = 60 * 60 * 24 * 90; // 90 days

export async function createRefereeToken(label: string, secret: string): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + REFEREE_TTL_SEC);
  const payload = `${label}.${exp}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyRefereeToken(
  token: string | undefined,
  secret: string
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [label, exp, sig] = parts;
  if (!/^[a-z]+$/.test(label)) return null;
  if (!/^\d+$/.test(exp)) return null;
  if (!safeEqual(sig, await hmac(secret, `${label}.${exp}`))) return null;
  if (Number(exp) <= Math.floor(Date.now() / 1000)) return null;
  return label;
}
