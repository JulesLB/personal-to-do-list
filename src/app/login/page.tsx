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
      <h1 style={{ fontSize: 20, letterSpacing: 1 }}>HERMES</h1>
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
