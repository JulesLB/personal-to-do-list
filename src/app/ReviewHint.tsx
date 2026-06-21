"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// The one coachmark: Review is the only persistent control a new user can't guess
// from its label, and it outlives the first-run empty state. A single dismissible
// bubble, shown once (localStorage), only after the user has items so it never
// piles onto the empty board (which already explains Review in step 3).
const KEY = "ember_review_hint_seen";

export function ReviewHint({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      // localStorage blocked (private mode): just skip the hint.
    }
  }, [enabled]);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div className="review-hint-wrap">
      <Link href="/review" className="nav-btn" onClick={dismiss}>
        Review
      </Link>
      {show ? (
        <div className="review-hint" role="status">
          <span>Review reads your week back: what you cleared and what is slipping.</span>
          <button type="button" className="review-hint-x" onClick={dismiss} aria-label="Got it">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
