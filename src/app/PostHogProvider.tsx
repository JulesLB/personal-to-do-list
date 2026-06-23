"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import posthog from "posthog-js";

// Launch-prereq: product analytics for the funnel the Sunday review reads. Wired
// no-op-safe — with no NEXT_PUBLIC_POSTHOG_KEY it never initializes, so it ships
// dark and starts firing the moment the key lands in the env + Vercel (same
// pattern as the timed-nudge GitHub scheduler). PostHog needs the browser, so the
// init runs client-side only; modern posthog-js captures `$pageview` on history
// changes itself, so App Router client navigations are tracked without a manual
// page-view component.
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: "identified_only",
    });
  }, []);

  return <>{children}</>;
}
