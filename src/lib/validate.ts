// Server-side input bounds for the fields a user (board form, Telegram, or the
// classifier) can put on an item. Frontend limits are UX; these are the real
// guard, applied on every create/update path so a long title can't bloat the DB.

export const MAX_TITLE = 200;

// Trim and cap a title. Returns "" for blank/whitespace, so callers keep their
// existing "ignore a blank title" guard.
export function clampTitle(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MAX_TITLE);
}
