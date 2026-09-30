-- Auth0 session store, backing @auth0/nextjs-auth0's stateful SessionDataStore
-- interface so back-channel logout (deleteByLogoutToken) can work.
--
-- Deliberately named portal_auth_sessions, NOT auth_sessions — this project
-- shares its Supabase project with the Maison storefront
-- (v0-e-commerce-application), which already has its own auth_sessions
-- table (scripts/006_create_sessions.sql there) for a completely different
-- Auth0 application's shopper sessions. Two apps writing into one shared
-- auth_sessions table would mean deleteByLogoutToken's sub-scoped delete
-- (used when a logout token carries no sid) could delete an unrelated
-- app's session for the same underlying sub on the shared tenant — running
-- this under its own table name keeps the two fully isolated even though
-- they're in the same Postgres database.
CREATE TABLE IF NOT EXISTS portal_auth_sessions (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL,
  sid TEXT,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS with no policies: anon/authenticated get zero access by
-- default. Only the service_role key (used exclusively server-side by
-- lib/supabase/service-role.ts) can read/write — it bypasses RLS entirely.
ALTER TABLE portal_auth_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_portal_auth_sessions_sub ON portal_auth_sessions(sub);
CREATE INDEX IF NOT EXISTS idx_portal_auth_sessions_sid ON portal_auth_sessions(sid);
