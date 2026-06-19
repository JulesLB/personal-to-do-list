"use client";

import { useRef, useTransition } from "react";
import { markDone } from "./actions";

// The card's burn-to-ash animation runs first, then the server drops the row.
// Kept just under the CSS duration (~1.3s) so the action fires as the ash finishes.
const BURN_MS = 1280;

// Replaces the plain Done form. On tap it sets the nearest [data-burnable] card
// alight, waits for the flames, then calls markDone (which revalidates and removes
// the row). Reduced-motion or a detached card falls straight through to the action.
export function BurnButton({
  id,
  variant,
  commitment,
}: {
  id: number;
  variant: "row" | "hero";
  commitment?: boolean;
}) {
  const [pending, start] = useTransition();
  const fired = useRef(false);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (fired.current) return;
    fired.current = true;
    const card = e.currentTarget.closest<HTMLElement>("[data-burnable]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const go = () => start(() => markDone(id));
    if (card && !reduce) {
      card.classList.add("igniting");
      window.setTimeout(go, BURN_MS);
    } else {
      go();
    }
  };

  if (variant === "hero") {
    return (
      <button className="done-lg" type="button" onClick={onClick} disabled={pending}>
        Done
      </button>
    );
  }
  return (
    <button
      className="done"
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={commitment ? "honored this cycle" : "mark done"}
    >
      ✓
    </button>
  );
}
