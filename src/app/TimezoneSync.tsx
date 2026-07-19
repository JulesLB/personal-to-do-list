"use client";

import { useEffect } from "react";
import { updateTimezone } from "./actions";

// PRD-18: the zero-effort half of per-user timezones. The browser already knows
// where the device is (Intl.resolvedOptions().timeZone, which the OS resets from
// the network on travel). On load we compare it to the stored zone and, only if it
// changed, tell the server — so a user who lands abroad and opens their board has
// their 08:00 / 20:00 nudges follow them without typing anything. The `/tz` command
// is the manual override; this is the default path.
export function TimezoneSync({ current }: { current: string }) {
  useEffect(() => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browser && browser !== current) {
      // Fire and forget: a failed sync just retries next load, and the stored zone
      // (worst case the previous location) still drives sane nudges meanwhile.
      void updateTimezone(browser);
    }
  }, [current]);
  return null;
}
