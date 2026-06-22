import Link from "next/link";
import { HeroFlow, Reveal } from "./LandingDemo";
import EmberShader from "./EmberShader";

// Telegram paper-plane mark, inline so it inherits layout and needs no asset.
function TelegramIcon() {
  return (
    <svg className="lp-snip-tg" viewBox="0 0 24 24" width={16} height={16} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="12" fill="#29a9eb" />
      <path
        fill="#fff"
        d="M5.5 11.8 17 7.3c.5-.2 1 .1.9.8l-2 9.3c-.1.6-.5.7-1 .4l-2.8-2-1.3 1.3c-.2.2-.3.3-.6.3l.2-3 5.3-4.8c.2-.2 0-.3-.3-.1l-6.6 4.1-2.8-.9c-.6-.2-.6-.6.1-.9Z"
      />
    </svg>
  );
}

// Five flame-toned goo blobs (radial gradients) that drift behind the "why" cards.
// Pure CSS animation; the goo SVG filter melts them together. Recolored from the
// source's neon palette to Ember's flame family.
function GooBlobs() {
  return (
    <div className="lp-goo" aria-hidden>
      <div className="lp-goo-blobs">
        <span className="lp-goo-blob b1" />
        <span className="lp-goo-blob b2" />
        <span className="lp-goo-blob b3" />
        <span className="lp-goo-blob b4" />
        <span className="lp-goo-blob b5" />
      </div>
    </div>
  );
}

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
        {/* Goo: blur the blobs, then a high-contrast alpha matrix fuses overlapping
            edges into one metaball mass before un-blurring the source. */}
        <filter id="lp-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
          <feBlend in="SourceGraphic" in2="goo" />
        </filter>
      </svg>

      <div className="lp">
        <header className="lp-nav">
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
            <h2 className="lp-h2">
              How <span className="lp-flame-text">Ember</span> works
            </h2>
          </div>

          <div className="lp-how-grid">
            <Reveal className="lp-howstep lp-howstep-a">
              <div className="lp-howstep-head">
                <span className="lp-how-chip">💬</span>
                <span className="lp-how-num">Step 1</span>
              </div>
              <h3 className="lp-how-h">Text it</h3>
              <p className="lp-how-p">Tell Ember what you need to do, by text or voice. It files a clean, dated task.</p>
              <div className="lp-howstep-art">
                <div className="lp-snip lp-snip-chat">
                  <div className="lp-snip-head">
                    <TelegramIcon />
                    Ember bot
                  </div>
                  <div className="lp-bubble lp-bubble-me">call the dentist friday, tell my wife</div>
                  <div className="lp-bubble lp-bubble-bot">Created &lsquo;Call the dentist&rsquo; · due Fri 🦷</div>
                </div>
              </div>
            </Reveal>

            <Reveal className="lp-howstep lp-howstep-b" delay={120}>
              <div className="lp-howstep-head">
                <span className="lp-how-chip">📊</span>
                <span className="lp-how-num">Step 2</span>
              </div>
              <h3 className="lp-how-h">It chases you</h3>
              <p className="lp-how-p">Everything sits ranked by what&apos;s due. Ember nudges you in Telegram until it&apos;s done.</p>
              <div className="lp-howstep-art">
                <div className="lp-snip lp-snip-board">
                  <div className="lp-flow-row lp-flow-line overdue">
                    <span className="lp-flow-title">Call the dentist</span>
                    <span className="lp-flow-due od">2d overdue</span>
                  </div>
                  <div className="lp-flow-row lp-flow-line">
                    <span className="lp-flow-title">File Q2 taxes</span>
                    <span className="lp-flow-due">in 5 days</span>
                  </div>
                  <div className="lp-flow-row lp-flow-line">
                    <span className="lp-flow-title">Gym, 3x this week</span>
                    <span className="lp-flow-due">in 6 days</span>
                  </div>
                  <div className="lp-flow-row lp-flow-line">
                    <span className="lp-flow-title">Renew passport</span>
                    <span className="lp-flow-due">in 2 wks</span>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal className="lp-howstep lp-howstep-c" delay={240}>
              <div className="lp-howstep-head">
                <span className="lp-how-chip">🤝</span>
                <span className="lp-how-num">Step 3</span>
              </div>
              <h3 className="lp-how-h">It calls in backup</h3>
              <p className="lp-how-p">Name someone you trust. Stall too long and Ember texts them what you&apos;re dodging.</p>
              <div className="lp-howstep-art">
                <div className="lp-snip">
                  <div className="lp-wa">
                    <div className="lp-wa-head">
                      <span className="lp-wa-avatar">W</span>
                      <span>Your wife</span>
                    </div>
                    <div className="lp-wa-bubble">Hi, it&apos;s Ember. Jules said he&apos;d call the dentist and hasn&apos;t. Mind nudging him?</div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="lp-why">
          <h2 className="lp-h3">
            What makes <span className="lp-flame-text">Ember</span> different from your notes app
          </h2>
          <div className="lp-why-stage">
            <GooBlobs />
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
          </div>
        </section>

        <section className="lp-final">
          <EmberShader />
          <div className="lp-final-inner">
            <h2 className="lp-final-h">Let&apos;s start with something you&apos;ve been putting off.</h2>
            <p className="lp-final-p">
              Set up in two minutes. Your chat is your login, no account, no password.
            </p>
            <Cta size="lg" />
          </div>
        </section>

        <footer className="lp-foot">
          <span className="lp-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={20} height={20} className="lp-brand-logo" />
            <span className="lp-brand-name lp-foot-name">Ember</span>
          </span>
          <span className="lp-foot-meta">© 2026 Ember</span>
        </footer>
      </div>
    </>
  );
}
