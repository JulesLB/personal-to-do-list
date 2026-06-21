import Link from "next/link";

// The single funnel + re-entry page (there's no separate login page). It walks a
// new person onto Telegram and their board, and doubles as where a logged-out
// board visit lands. Ember's identity is the Telegram chat, so there's no web
// signup and no password: the bot mints a private one-tap board link. The owner's
// APP_SECRET fast path is intentionally not exposed here (owner-only, not for end
// users) — sign in as the owner via the Telegram /board link, same as anyone.
const TELEGRAM_INSTALL = "https://telegram.org/";
const TELEGRAM_WEB = "https://web.telegram.org/";

export const metadata = { title: "Get started with Ember" };

export default async function GetStarted() {
  const bot = process.env.TELEGRAM_BOT_URL ?? TELEGRAM_INSTALL;

  return (
    <div className="lp gs">
      <header className="lp-nav lp-nav-center">
        <span className="lp-spacer" />
        <Link href="/landing" className="lp-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={28} height={28} className="lp-brand-logo" />
          <span className="lp-brand-name">Ember</span>
        </Link>
        <span className="lp-spacer" />
      </header>

      <section className="gs-main">
        <span className="lp-eyebrow">Three steps, no password</span>
        <h1 className="lp-h1 gs-h1">Let&apos;s get you set up.</h1>
        <p className="lp-lede gs-lede">
          Ember lives in Telegram so it can nudge you anywhere, and shows everything on a web board you open
          from the chat. Your chat is your login, there is no account or password to create.
        </p>

        <ol className="gs-steps">
          <li className="gs-step">
            <span className="lp-step-num">1</span>
            <div className="gs-step-body">
              <h2 className="gs-step-h">Get Telegram</h2>
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
              <a href={bot} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-lg">
                Open Ember on Telegram
              </a>
            </div>
          </li>
          <li className="gs-step">
            <span className="lp-step-num">3</span>
            <div className="gs-step-body">
              <h2 className="gs-step-h">Open and review all your tasks</h2>
              <p className="gs-step-p">
                In the chat, send <strong>/board</strong>. Ember replies with a private, one-tap link to your
                board, no password needed. That board is your home base: every task ranked by what is most
                pressing, where you see what is ongoing and tick things off.
              </p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
