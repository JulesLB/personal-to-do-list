"use client";

import { useEffect, useRef, useState } from "react";

// Scroll-reveal wrapper: fades + lifts its children in once they scroll into view,
// so the how-it-works steps arrive one after another instead of all at once.
// Reduced-motion shows everything immediately.
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.18 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`lp-reveal${shown ? " in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

// HeroFlow: the whole product in one looping phone. It plays slowly enough to read:
// you text the bot, it confirms in the real echo format, the task lands on your
// ranked board, goes overdue and red, Ember nudges you, then escalates to your
// referee (sent → read across two days), and finally you tap done and it burns to
// ash (the real .igniting effect; #ember-fire filter is rendered by Landing).
// A phase counter cycles the timeline. Reduced-motion parks on the board frame.
//
// phases: 0 type · 1 typing · 2 bot confirms · 3 board · 4 overdue+nudge ·
//         5 referee sent (day 1) · 6 referee read (day 2) · 7 burn · 8 hold.
const PHASE_MS = [1700, 1000, 2700, 1900, 2300, 2400, 2400, 1600, 1500];

export function HeroFlow() {
  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setPhase(3);
    }
  }, []);

  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setPhase((p) => (p + 1) % PHASE_MS.length), PHASE_MS[phase]);
    return () => window.clearTimeout(t);
  }, [phase, reduced]);

  const onBoard = phase >= 3;
  const overdue = phase >= 4;
  const burning = phase >= 7;
  const showNudge = phase === 4;
  const showEsc = phase >= 5 && phase <= 7;
  const escRead = phase >= 6;

  return (
    <div className="lp-phone" aria-hidden>
      <div className="lp-chat-head">
        <span className="lp-chat-avatar">🔥</span>
        <span className="lp-chat-name">
          Ember <span className="lp-chat-bot">{onBoard ? "· your board" : "bot"}</span>
        </span>
      </div>

      {!onBoard ? (
        <div className="lp-chat-body" key="chat">
          <div className="lp-bubble lp-bubble-me">remember to call the dentist friday, tell my wife</div>
          {phase === 1 ? (
            <div className="lp-bubble lp-bubble-bot lp-typing">
              <span />
              <span />
              <span />
            </div>
          ) : null}
          {phase >= 2 ? (
            <div className="lp-bubble lp-bubble-bot">
              Created &lsquo;Call the dentist&rsquo; due Fri 26 Jun, wife as referee 🦷
              <span className="lp-bubble-meta">#41 · task · health · by 2026-06-26</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="lp-board-body lp-screen-in" key="board">
          <div className="lp-flow-feed">
            <div
              className={`lp-flow-row${overdue ? " overdue" : ""}${burning ? " igniting" : ""}`}
              data-burnable
            >
              <div className="lp-flow-main">
                <div className="lp-flow-title">Call the dentist</div>
                <div className="lp-mini-meta">
                  <span className="lp-mini-dot" style={{ "--c": "#16b074" } as React.CSSProperties} />
                  Health
                  <span className={`lp-flow-due${overdue ? " od" : ""}`}>{overdue ? "2d overdue" : "due Fri"}</span>
                </div>
              </div>
              <span className="lp-flow-tick">✓</span>
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
              <span className="lp-flow-tick" />
            </div>
          </div>

          {showNudge ? (
            <div className="lp-nudge">🔔 You said you&apos;d call the dentist Friday. It&apos;s slipping.</div>
          ) : null}

          {showEsc ? (
            <div className="lp-esc">
              <div className="lp-esc-head">
                <span className="lp-wa-avatar">W</span>
                Ember messaged your wife
              </div>
              <div className="lp-esc-body">
                Jules said he&apos;d call the dentist and still hasn&apos;t. Mind nudging him?
              </div>
              <div className={`lp-esc-status${escRead ? " read" : ""}`}>
                {escRead ? "✓✓ Read · Day 2" : "✓ Delivered · Day 1"}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
