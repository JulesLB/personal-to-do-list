"use client";

import { useState } from "react";
import { snoozeItem } from "./actions";

const PRESETS: [string, string][] = [
  ["tonight", "Tonight"],
  ["tomorrow", "Tomorrow"],
  ["weekend", "This weekend"],
  ["nextweek", "Next week"],
];

export function SnoozeMenu({ id }: { id: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="snz">
      <button
        type="button"
        className="snz-btn"
        aria-label="snooze"
        title="Snooze"
        onClick={() => setOpen((o) => !o)}
      >
        💤
      </button>
      {open ? (
        <>
          <div className="snz-backdrop" onClick={() => setOpen(false)} />
          <div className="snz-pop">
            {PRESETS.map(([val, label]) => (
              <form key={val} action={snoozeItem.bind(null, id, val)} onSubmit={() => setOpen(false)}>
                <button type="submit" className="snz-opt">
                  {label}
                </button>
              </form>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
