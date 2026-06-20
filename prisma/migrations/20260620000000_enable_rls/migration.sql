-- Defense in depth: enable row level security on every table. The app connects
-- as the table-owner Postgres role via DATABASE_URL, and a table owner BYPASSES
-- RLS (we deliberately do NOT use FORCE), so the app is unaffected. With RLS on
-- and no policies, every other role is default-deny -- which closes the Supabase
-- Data API (the anon / authenticated PostgREST roles) that would otherwise be
-- able to read these tables over HTTPS with RLS off. Single-user app, but the
-- task data is personal, so it should not be reachable outside the app.
ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
