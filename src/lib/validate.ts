import { CATEGORIES } from "./rank";

// Server-side input bounds for the fields a user (board form, Telegram, or the
// classifier) can put on an item. Frontend limits are UX; these are the real
// guard, applied on every create/update path so a long title can't bloat the DB
// and an out-of-set category can't break the board's dot/label rendering.

export const MAX_TITLE = 200;

// The six allowed category keys, taken straight from CATEGORIES so this never
// drifts from the source of truth in rank.ts.
const CATEGORY_KEYS = new Set(Object.keys(CATEGORIES));

// Trim and cap a title. Returns "" for blank/whitespace, so callers keep their
// existing "ignore a blank title" guard.
export function clampTitle(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MAX_TITLE);
}

// Keep a category only if it's one of the six known keys; anything else (a stray
// form value, a hallucinated label) becomes null rather than a broken row.
export function normalizeCategory(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v && CATEGORY_KEYS.has(v) ? v : null;
}
