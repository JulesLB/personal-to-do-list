// M5 first-run activation. Pure helpers + copy for the guided first run, kept
// out of the route so the state logic is unit-testable with no DB or Telegram.
// The flow is deliberately value-first: a fresh chat is greeted, captures one
// real item (the activation event), then gets a one-time orientation. The
// referee beat is parked; it will slot a step in between first-capture and done.

export const ONBOARDING_NEW = "new";
export const ONBOARDING_DONE = "done";

// A structural shape so callers and tests don't need the generated Prisma client.
type OnboardingUser = { name?: string | null; onboardingStep?: string | null };

// True for a fresh chat that hasn't captured its first item yet.
export function isOnboarding(user: OnboardingUser): boolean {
  return user.onboardingStep === ONBOARDING_NEW;
}

// Telegram hands us the user's first name for free on every message, so we never
// ask for it. Private chats carry it on `from` (and `chat`); trim and cap so a
// junk value can't bloat the classifier prompt. Returns undefined when absent.
export function extractName(
  from?: { first_name?: string } | null,
  chat?: { first_name?: string } | null
): string | undefined {
  const raw = (from?.first_name ?? chat?.first_name ?? "").trim();
  return raw ? raw.slice(0, 40) : undefined;
}

// /start for a brand-new chat: warm, one ask, no command wall.
export function welcomeMessage(name?: string | null): string {
  const hi = name ? `Hey ${name}.` : "Hey.";
  return `${hi} I'm Ember. I nag you into doing the things you keep putting off.

No setup, no forms. Tell me one thing you've been avoiding and I'll track it. Try it now, just type it like "call the dentist this week" or "file my taxes by Friday".`;
}

// /start for someone already onboarded (and every legacy user).
export function returningMessage(): string {
  return `I'm here. Text me anything to track it, send /help for the full list, or open your board with /board.`;
}

// Sent once, right after the first captured item. Teaches the loop, not the syntax.
export function orientationMessage(): string {
  return `Nice, that's tracked. That's the whole thing: just talk to me, type or voice note, and I'll shape it.

A few things to know:
• I nudge you morning and night when something's actually pressing, and stay quiet when it's not.
• Manage everything on your board: /board
• Commands any time: /help

What else have you been putting off?`;
}

// The full command list, moved off the first screen and behind /help.
export function helpMessage(): string {
  return `Talk to me in plain English and I'll log it:
• "call the dentist friday" → a one-off task
• "gym every week" → a recurring commitment
• "push the dentist to monday" → edits it
• "did the call" → marks it done
• "drop the tax idea" → kills it for good

Commands: list · done <id> · snooze <id> <days> · due <id> YYYY-MM-DD · retire <id>
Web board: /board · This list: /help
Voice notes work everywhere a typed message does.`;
}
