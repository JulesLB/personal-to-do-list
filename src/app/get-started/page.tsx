import Link from "next/link";

// The funnel + re-entry page (there's no separate login page). It serves two
// audiences off one route, split by the ?return / ?error query:
//   - New users (no query): the full 3-step Telegram handoff.
//   - Returning users (?return=1, or ?error=1 after a stale board link): a short
//     "open the bot, send /board" re-entry, since the landing "Log in" link and a
//     logged-out board visit both land here.
// Ember's identity is the Telegram chat, so there's no web signup and no password:
// the bot mints a private one-tap board link either way. The owner's APP_SECRET fast
// path is intentionally not exposed here (owner-only) — sign in as the owner via the
// Telegram /board link, same as anyone.
const TELEGRAM_INSTALL = "https://telegram.org/";
const TELEGRAM_WEB = "https://web.telegram.org/";

export const metadata = { title: "Get started with Ember" };

// Telegram's paper-plane mark, inline so it inherits color and needs no asset.
function TelegramIcon() {
  return (
    <svg className="gs-tg-icon" viewBox="0 0 24 24" width={20} height={20} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="12" fill="#29a9eb" />
      <path
        fill="#fff"
        d="M5.5 11.8 17 7.3c.5-.2 1 .1.9.8l-2 9.3c-.1.6-.5.7-1 .4l-2.8-2-1.3 1.3c-.2.2-.3.3-.6.3l.2-3 5.3-4.8c.2-.2 0-.3-.3-.1l-6.6 4.1-2.8-.9c-.6-.2-.6-.6.1-.9Z"
      />
    </svg>
  );
}

export default async function GetStarted({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; error?: string }>;
}) {
  const bot = process.env.TELEGRAM_BOT_URL ?? TELEGRAM_INSTALL;
  const { return: ret, error } = await searchParams;
  // A logged-out board visit, the "Log in" link, and a stale board link all want
  // the short re-entry, not the first-timer funnel.
  const returning = ret === "1" || error === "1";

  return (
    <div className="lp gs">
      <header className="lp-nav">
        <Link href="/landing" className="lp-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={28} height={28} className="lp-brand-logo" />
          <span className="lp-brand-name">Ember</span>
        </Link>
        <Link href="/landing" className="gs-back">
          Home
        </Link>
      </header>

      {returning ? (
        <section className="gs-main">
          {error === "1" && (
            <p className="gs-error">That board link didn&apos;t work or had expired. Here&apos;s a fresh way in.</p>
          )}
          <span className="lp-eyebrow">Welcome back</span>
          <h1 className="lp-h1 gs-h1">Get back to your board.</h1>
          <p className="lp-lede gs-lede">
            Your Telegram chat is your login, no password to remember. Open Ember and send{" "}
            <strong>/board</strong> — it replies with a one-tap link straight to your board.
          </p>
          <a href={bot} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-lg gs-step-btn">
            Open Ember on Telegram
          </a>
          <p className="gs-return">
            New to Ember?{" "}
            <Link href="/get-started" className="gs-link">
              Set up from scratch
            </Link>
            .
          </p>
        </section>
      ) : (
        <section className="gs-main">
          <span className="lp-eyebrow">Three steps, no password</span>
          <h1 className="lp-h1 gs-h1">Let&apos;s get you set up.</h1>
          <p className="lp-lede gs-lede">
            Ember lives in Telegram, so you can reach it from anywhere the moment a thought pops up. Add it
            there and Ember does the rest. Your chat is your login, there is no account or password to create.
          </p>

          <ol className="gs-steps">
            <li className="gs-step">
              <span className="lp-step-num">1</span>
              <div className="gs-step-body">
                <h2 className="gs-step-h">
                  <TelegramIcon />
                  Get Telegram
                </h2>
                <p className="gs-step-p">
                  On your phone, install the free Telegram app from your app store. On a computer you do not need
                  to install anything, just open{" "}
                  <a href={TELEGRAM_WEB} target="_blank" rel="noopener noreferrer" className="gs-link">
                    Telegram in your browser
                  </a>
                  . First time on Telegram?{" "}
                  <a href={TELEGRAM_INSTALL} target="_blank" rel="noopener noreferrer" className="gs-link">
                    Start here
                  </a>
                  .
                </p>
              </div>
            </li>
            <li className="gs-step">
              <span className="lp-step-num">2</span>
              <div className="gs-step-body">
                <h2 className="gs-step-h">Open Ember, tap Start, send your first task</h2>
                <p className="gs-step-p">
                  Click the button below to open the Ember chat. Tap <strong>Start</strong> at the bottom, then
                  text it the first thing you have been putting off, like &ldquo;call the dentist friday&rdquo;.
                  Ember files it for you.
                </p>
                <a href={bot} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-lg gs-step-btn">
                  Open Ember on Telegram
                </a>
              </div>
            </li>
            <li className="gs-step">
              <span className="lp-step-num">3</span>
              <div className="gs-step-body">
                <h2 className="gs-step-h">Open your board</h2>
                <p className="gs-step-p">
                  In the chat, send <strong>/board</strong>. Ember replies with your private board, where you
                  find all your tasks ranked by what is most pressing and can start ticking things off.
                </p>
              </div>
            </li>
          </ol>

          <p className="gs-return">
            Already set up?{" "}
            <a href={bot} target="_blank" rel="noopener noreferrer" className="gs-link">
              Open Ember and send /board
            </a>{" "}
            to reach your board.
          </p>
        </section>
      )}

      <footer className="lp-foot">
        <span className="lp-foot-meta">
          Stuck or have a question?{" "}
          <a href="mailto:jules2lebreton@gmail.com" className="lp-foot-link">
            Email Jules
          </a>
        </span>
      </footer>
    </div>
  );
}
