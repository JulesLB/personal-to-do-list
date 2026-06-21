// Shown during a navigation while the dynamic board re-renders. Matters most on a
// cold serverless start, when the render takes a beat; without this the old page
// just sits there looking frozen. Calm, low-contrast skeletons sized to the real
// chrome so a warm (~100ms) render doesn't flash anything jarring and the swap to
// live content doesn't jump.
export default function Loading() {
  return (
    <main className="wrap" aria-busy="true">
      <header className="topbar">
        <span className="brand">
          <img className="brand-logo" src="/logo.png" alt="" width={24} height={24} />
          <span className="wordmark">Ember</span>
        </span>
        <span className="skel skel-chip" />
        <span className="skel skel-add" />
      </header>

      <section className="skel skel-hero" />
      <div className="skel skel-band" />
      <div className="skel skel-band" />
    </main>
  );
}
