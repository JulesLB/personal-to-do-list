import Link from "next/link";
import { HeroFlow, Reveal } from "./LandingDemo";

// Public marketing page (rendered at /landing). Explains Ember, shows the whole
// loop end-to-end in the hero animation, then walks the three steps (revealing on
// scroll) and why it beats a plain list. Only action: "Start on Ember" →
// /get-started, which handles the Telegram handoff. No pricing, no email capture.
//
// Styling extends the board tokens + flame gradient; the wordmark is gradient text
// like the admin header. A soft wash behind the hero fades to white before the
// steps. How-it-works steps sit in light cards, stacked, revealed on scroll.
export function Landing() {
  const Cta = ({ size }: { size: "sm" | "lg" }) => (
    <Link href="/get-started" className={`lp-btn lp-btn-${size}`}>
      Start on Ember
    </Link>
  );

  return (
    <>
      {/* The board's fractal-noise filter, so the burn in HeroFlow gets a torn edge. */}
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        <filter id="ember-fire" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.045" numOctaves={3} seed={7} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <div className="lp">
        <header className="lp-nav lp-nav-center">
          <span className="lp-spacer" />
          <span className="lp-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={28} height={28} className="lp-brand-logo" />
            <span className="lp-brand-name">Ember</span>
          </span>
          <div className="lp-nav-actions">
            <Link href="/" className="lp-login">
              Log in
            </Link>
            <Cta size="sm" />
          </div>
        </header>

        <section className="lp-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">Your accountability partner</span>
            <h1 className="lp-h1">
              Remember that dentist appointment from February? It&apos;s July. You still haven&apos;t booked it.
            </h1>
            <p className="lp-lede">
              <strong>Ember holds you to it.</strong> Stop dropping the things you said you&apos;d do. Text Ember
              what you commit to, and it keeps everything ordered by what&apos;s due, then nudges you until it is
              done.
            </p>
            <div className="lp-cta-row">
              <Cta size="lg" />
            </div>
          </div>
          <div className="lp-hero-demo">
            <HeroFlow />
          </div>
        </section>

        <section className="lp-how">
          <div className="lp-how-head">
            <h2 className="lp-h2">How it works</h2>
          </div>

          <Reveal className="lp-howbox lp-howbox-a">
            <div className="lp-howbox-text">
              <span className="lp-how-chip">💬</span>
              <span className="lp-how-num">Step 1</span>
              <h3 className="lp-how-h">Text it, even messy</h3>
              <p className="lp-how-p">
                Message Ember like you would text a friend, or send a voice note. It reads the mess and turns
                it into a clean, dated task, with an accountability partner if you name one.
              </p>
            </div>
            <div className="lp-how-art">
              <div className="lp-snip">
                <div className="lp-bubble lp-bubble-me">buy a card for my wife&apos;s birthday tue, tell her</div>
                <div className="lp-bubble lp-bubble-bot">
                  Created &lsquo;Buy a card for my wife&apos;s birthday&rsquo; due Tue 23 Jun, wife as partner 🎂
                  <span className="lp-bubble-meta">#62 · task · personal · by 2026-06-23</span>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal className="lp-howbox lp-howbox-b">
            <div className="lp-howbox-text">
              <span className="lp-how-chip">📊</span>
              <span className="lp-how-num">Step 2</span>
              <h3 className="lp-how-h">It shows what&apos;s urgent and pushes you to finish</h3>
              <p className="lp-how-p">
                Your board and the Telegram bot keep you on the hook for what you said you&apos;d deliver. The
                most urgent item sits on top, and Ember pings you morning and night until it is done.
              </p>
            </div>
            <div className="lp-how-art">
              <div className="lp-snip lp-snip-board">
                <div className="lp-flow-row overdue">
                  <div className="lp-flow-main">
                    <div className="lp-flow-title">Call the dentist</div>
                    <div className="lp-mini-meta">
                      <span className="lp-mini-dot" style={{ "--c": "#16b074" } as React.CSSProperties} />
                      Health
                      <span className="lp-flow-due od">2d overdue</span>
                    </div>
                  </div>
                </div>
                <div className="lp-flow-row">
                  <div className="lp-flow-main">
                    <div className="lp-flow-title">File Q2 taxes</div>
                    <div className="lp-mini-meta">
                      <span className="lp-mini-dot" style={{ "--c": "#f5a623" } as React.CSSProperties} />
                      Money
                      <span className="lp-flow-due">in 5 days</span>
                    </div>
                  </div>
                </div>
                <div className="lp-flow-row">
                  <div className="lp-flow-main">
                    <div className="lp-flow-title">Gym, 3x this week</div>
                    <div className="lp-mini-meta">
                      <span className="lp-mini-dot" style={{ "--c": "#16b074" } as React.CSSProperties} />
                      Health
                      <span className="lp-flow-due">in 6 days</span>
                    </div>
                  </div>
                </div>
                <div className="lp-nudge lp-nudge-static">🔔 You said you&apos;d call the dentist. Still open.</div>
              </div>
            </div>
          </Reveal>

          <Reveal className="lp-howbox lp-howbox-c">
            <div className="lp-howbox-text">
              <span className="lp-how-chip">🤝</span>
              <span className="lp-how-num">Step 3</span>
              <h3 className="lp-how-h">Name an accountability partner Ember can call in</h3>
              <p className="lp-how-p">
                Pick someone, your partner, your sister, a colleague. Stall too long and Ember texts them what
                you have been dodging. The consequence a to-do list can never give you.
              </p>
            </div>
            <div className="lp-how-art">
              <div className="lp-snip">
                <div className="lp-wa">
                  <div className="lp-wa-head">
                    <span className="lp-wa-avatar">W</span>
                    <span>Your wife</span>
                  </div>
                  <div className="lp-wa-bubble">
                    Hi, it&apos;s Ember. Jules said he&apos;d call the dentist 5 days ago and hasn&apos;t. Mind
                    nudging him?
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="lp-why">
          <h2 className="lp-h3">What makes Ember different from your notes app</h2>
          <div className="lp-cards">
            <div className="lp-feat">
              <span className="lp-feat-ico">📲</span>
              <h3 className="lp-feat-h">A list waits. Ember chases.</h3>
              <p className="lp-feat-p">
                Your notes app sits there until you open it. Ember comes to you, morning and night, the moment
                something is due.
              </p>
            </div>
            <div className="lp-feat">
              <span className="lp-feat-ico">🎯</span>
              <h3 className="lp-feat-h">It decides what is next</h3>
              <p className="lp-feat-p">
                No folders, no tags, no priorities to maintain. Ember ranks everything by what is most pressing,
                so you never sort a list again.
              </p>
            </div>
            <div className="lp-feat">
              <span className="lp-feat-ico">🤝</span>
              <h3 className="lp-feat-h">It makes you accountable</h3>
              <p className="lp-feat-p">
                A real person gets a message when you keep dodging. No app on your phone can put that on the
                line for you.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-final">
          <h2 className="lp-final-h">Stop letting things slip.</h2>
          <p className="lp-final-p">Set up in two minutes. No account, no password.</p>
          <Cta size="lg" />
        </section>

        <footer className="lp-foot">
          <span className="lp-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={20} height={20} className="lp-brand-logo" />
            Ember
          </span>
          <span className="lp-foot-meta">
            © 2026 Ember ·{" "}
            <Link href="/" className="lp-foot-link">
              Log in
            </Link>
          </span>
        </footer>
      </div>
    </>
  );
}
