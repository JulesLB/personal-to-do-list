"use client";

import { useRef, useTransition } from "react";
import { markDone } from "./actions";

// The burn-to-ash animation runs first (~1.3s of flame sweep + collapse). BURN_MS
// sits just past the CSS total so the card is fully collapsed before we hide it.
const BURN_MS = 1320;

// Replaces the plain Done form. On tap it sets the nearest [data-burnable] card
// alight, waits for the flames, then calls markDone (which revalidates and removes
// the row). Reduced-motion or a detached card falls straight through to the action.
export function BurnButton({
  id,
  variant,
  commitment,
  onDone,
}: {
  id: number;
  variant: "row" | "hero";
  commitment?: boolean;
  // Fired the instant the row vanishes (after the burn, or immediately when motion
  // is off). The Review page uses it to cool the bonfire in sync with the flames.
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  const fired = useRef(false);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (fired.current) return;
    fired.current = true;
    const card = e.currentTarget.closest<HTMLElement>("[data-burnable]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const go = () => {
      onDone?.();
      start(() => markDone(id));
    };
    if (card && !reduce) {
      card.classList.add("igniting");
      window.setTimeout(() => {
        // Close the gap the moment the burn finishes, on the client. The card
        // collapses to max-height:0, but in a flex column with a gap a zero-height
        // row still holds its surrounding gap open — and that remnant only closed
        // when revalidate re-rendered the board and React unmounted the node. On a
        // slow (dev / cold) render that wait was the lag you felt "when it
        // disappears". Hiding it now makes the disappear instant; markDone still
        // runs and drops the already-hidden node in the background.
        card.classList.add("burned");
        go();
      }, BURN_MS);
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
