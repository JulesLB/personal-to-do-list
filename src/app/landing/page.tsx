import { Landing } from "../Landing";

// Public marketing page at /landing (kept off `/` so it never collides with the
// gated board). The middleware leaves /landing open; the CTA points at
// /get-started, which walks a new person onto Telegram and their board.
export const metadata = {
  title: "Ember — the accountability partner that won't let it slide",
  description:
    "Text Ember what you commit to. It ranks everything by what's most pressing, nudges you morning and night, and loops in a real person if you stall.",
};

export default function LandingPage() {
  return <Landing />;
}
