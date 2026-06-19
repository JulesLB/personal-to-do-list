export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main
      style={{
        maxWidth: 340,
        margin: "16vh auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Ember" width={36} height={36} style={{ borderRadius: 9 }} />
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            background: "linear-gradient(95deg, #ffb02e, #ff6a18 55%, #e0301e)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Ember
        </h1>
      </div>
      <p style={{ color: "#969cb2", fontSize: 14 }}>Enter your access key.</p>
      <form action="/api/login" method="post">
        <input
          name="key"
          type="password"
          placeholder="access key"
          autoComplete="current-password"
          style={{ width: "100%", padding: 10, fontSize: 16, boxSizing: "border-box" }}
        />
        <button type="submit" style={{ marginTop: 12, padding: "10px 16px", fontSize: 16 }}>
          Enter
        </button>
      </form>
      {sp?.error ? <p style={{ color: "#ff6b6b" }}>Wrong key.</p> : null}
    </main>
  );
}
