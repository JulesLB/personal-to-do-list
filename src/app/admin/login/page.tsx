export default async function AdminLogin({
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
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Ember ops</h1>
      <p style={{ color: "#969cb2", fontSize: 14 }}>
        Back-office access. This is not the board key.
      </p>
      <form action="/api/admin/login" method="post">
        <input
          name="key"
          type="password"
          placeholder="admin secret"
          autoComplete="current-password"
          style={{ width: "100%", padding: 10, fontSize: 16, boxSizing: "border-box" }}
        />
        <button type="submit" style={{ marginTop: 12, padding: "10px 16px", fontSize: 16 }}>
          Enter
        </button>
      </form>
      {sp?.error === "rate" ? (
        <p style={{ color: "#ff6b6b" }}>Too many attempts. Wait a few minutes and try again.</p>
      ) : sp?.error ? (
        <p style={{ color: "#ff6b6b" }}>Wrong secret.</p>
      ) : null}
    </main>
  );
}
