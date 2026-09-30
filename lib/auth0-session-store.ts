import type { LogoutToken, SessionData, SessionDataStore } from "@auth0/nextjs-auth0/types"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

// This project shares a Supabase project with the Maison storefront
// (v0-e-commerce-application) — deliberately: table name is
// portal_auth_sessions, NOT auth_sessions, so the portal's own sessions
// (a different Auth0 application, different users — partner employees,
// not shoppers) never share a table with Maison's shopper sessions. Two
// separate Auth0Client instances writing into the same auth_sessions table
// would mean deleteByLogoutToken's sub-scoped delete (below, when no sid is
// present) could delete an unrelated app's session for the same underlying
// sub on a shared tenant — a real cross-app blast radius, not just an
// organizational nicety. See scripts/001_create_sessions.sql.
const SESSIONS_TABLE = "portal_auth_sessions"

// Mirrors the SDK's default `absoluteDuration` (3 days). Session rows are
// re-extended by this much on every write, matching the SDK's TTL contract.
// Keep in sync if `session.absoluteDuration` is ever overridden in lib/auth0.ts.
const SESSION_TTL_SECONDS = 3 * 24 * 60 * 60

function futureExpiry(): string {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
}

export const authSessionStore: SessionDataStore = {
  async get(id) {
    const supabase = createServiceRoleClient()
    const { data: row } = await supabase
      .from(SESSIONS_TABLE)
      .select("data, expires_at")
      .eq("id", id)
      .maybeSingle()

    if (!row) return null

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await supabase.from(SESSIONS_TABLE).delete().eq("id", id)
      return null
    }

    return row.data as SessionData
  },

  async set(id, session) {
    const supabase = createServiceRoleClient()
    await supabase.from(SESSIONS_TABLE).upsert({
      id,
      sub: session.user.sub,
      sid: session.internal.sid,
      data: session,
      expires_at: futureExpiry(),
    })
  },

  async update(id, session) {
    const supabase = createServiceRoleClient()
    const { data: rows } = await supabase
      .from(SESSIONS_TABLE)
      .update({
        sub: session.user.sub,
        sid: session.internal.sid,
        data: session,
        expires_at: futureExpiry(),
      })
      .eq("id", id)
      .select("id")

    return Boolean(rows && rows.length > 0)
  },

  async delete(id) {
    const supabase = createServiceRoleClient()
    await supabase.from(SESSIONS_TABLE).delete().eq("id", id)
  },

  async deleteByLogoutToken(logoutToken: LogoutToken) {
    const supabase = createServiceRoleClient()
    if (logoutToken.sid) {
      await supabase.from(SESSIONS_TABLE).delete().eq("sid", logoutToken.sid)
    } else if (logoutToken.sub) {
      await supabase.from(SESSIONS_TABLE).delete().eq("sub", logoutToken.sub)
    }
  },
}
