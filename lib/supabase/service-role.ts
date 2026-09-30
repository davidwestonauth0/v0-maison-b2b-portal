import { createClient } from "@supabase/supabase-js"

// Server-only client authenticated with the service_role key, which bypasses
// RLS entirely. Never import this from client code or expose the key to the
// browser. Used exclusively by lib/auth0-session-store.ts, since the
// portal_auth_sessions table holds live access/refresh/ID tokens and has no
// RLS policies granting anon/authenticated access.
//
// This project deliberately shares its Supabase project with the Maison
// storefront (v0-e-commerce-application) rather than needing a dedicated
// one — NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY here should be
// set to that same project's values. Table names are kept separate
// (portal_auth_sessions vs. Maison's own auth_sessions) so the two apps'
// session data never mixes despite living in one Postgres database — see
// scripts/001_create_portal_sessions.sql.
export function createServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
