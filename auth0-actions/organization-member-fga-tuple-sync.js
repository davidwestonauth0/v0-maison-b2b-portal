/**
 * Reference only — not deployed by this app. Bind to an Event Stream
 * (Actions > Library > Flows/Triggers isn't the right place — this is an
 * Event Stream-bound Action, configured under Monitoring > Event Streams >
 * create a stream > "Actions" delivery, or Actions > Flows > "Event Stream"
 * trigger depending on dashboard version) subscribed to
 * organization.member.added, organization.member.deleted,
 * organization.member.role.assigned and organization.member.role.deleted.
 *
 * Unlike every other Action in this directory, this one has no token to
 * modify and doesn't run as part of an interactive login — it's a pure
 * side-effect Action, firing whenever a Dashboard admin (or the My
 * Organization API, via the self-service member-management component)
 * changes who belongs to an organization, even if nobody is logging in at
 * that moment. That's why org-membership sync can't live in a Post-Login
 * Action (post-login-add-roles-claim.js's approach) — a Post-Login Action
 * only ever fires when the affected user themselves logs in next, which
 * could be long after the membership change and leaves a stale FGA tuple
 * in the meantime.
 *
 * Generic across every partner organization, not just one: the FGA object
 * id to use is read from the organization's own `fga_slug` metadata (the
 * same metadata field lib/partner-context.ts reads), falling back to the
 * raw org_<id> if a partner hasn't set one. This mirrors how the portal
 * itself never hardcodes a partner — see scripts/provision-partner-org.mjs
 * for what sets that metadata.
 *
 * Writes/deletes the FGA tuples this app's own lib/fga.ts
 * (isOrganizationAdmin / checkProductLineAccess's org-admin inheritance)
 * depends on:
 *   - organization:<slug>#member@user:<user_id>, from member.added/deleted
 *   - organization:<slug>#admin@user:<user_id>, from member.role.assigned/
 *     deleted when the role's name is the admin role (default "admin",
 *     override with the ORG_ADMIN_ROLE_NAME secret). Removing a member from
 *     the org also removes their admin tuple.
 * No other role names affect FGA.
 * Product-line-level manager/viewer grants are NOT touched here; those are
 * written directly by the portal's own delegated-admin UI
 * (app/team/actions.ts), since there's no Auth0 lifecycle event for an
 * app-level permission grant, only for org membership itself.
 *
 * Requires these secrets (Actions > Library > this action > Secrets):
 *   FGA_API_URL, FGA_STORE_ID, FGA_MODEL_ID (optional),
 *   FGA_API_TOKEN_ISSUER, FGA_API_AUDIENCE, FGA_CLIENT_ID, FGA_CLIENT_SECRET
 *   — same values as this app's own FGA_* env vars (lib/fga.ts)
 *   AUTH0_DOMAIN — this tenant's domain (canonical domain, not a custom
 *   domain — the Management API isn't served there, see
 *   lib/auth0.ts's getCanonicalDomain)
 *   AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET — the client_id/secret
 *   of the SAME client lib/auth0-management.ts reuses for the Management
 *   API (this app's regular web app client — AUTH0_CLIENT_ID/SECRET in its
 *   own env, just under Action-secret names here since Actions don't share
 *   this app's environment), authorized tenant-side for a
 *   client_credentials grant against the Management API
 *   (read:organizations) — needed here to look up the organization's
 *   fga_slug metadata.
 *
 * Requires the @openfga/sdk dependency added via the Action editor's
 * dependency manager.
 *
 * @param {Event} event
 */
const { OpenFgaClient, CredentialsMethod } = require("@openfga/sdk")

async function getManagementToken(domain, clientId, clientSecret) {
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`Management API token request failed (${res.status}): ${body}`)
  }
  return JSON.parse(body).access_token
}

async function getOrganizationFgaSlug(domain, token, orgId) {
  const res = await fetch(`https://${domain}/api/v2/organizations/${encodeURIComponent(orgId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`Failed to look up organization ${orgId} (${res.status}): ${body}`)
  }
  const org = JSON.parse(body)
  return (org.metadata && org.metadata.fga_slug) || orgId
}

exports.onExecuteEventStream = async (event) => {
  // event.message is CloudEvents-shaped (id/type/source/specversion/data) —
  // the actual organization/member payload is nested under
  // event.message.data.object, not event.message.data directly. Falls back
  // to data itself in case a payload isn't wrapped in `object`. The
  // organization/user field names inside it (organization.id, user.user_id)
  // were observed from a live event in the Event Stream log — re-check them
  // against a test event if Auth0 changes the schema.
  const message = event.message || {}
  const eventType = message.type
  const data = message.data || {}
  const payload = data.object || data
  const orgId = payload.organization && payload.organization.id
  const userId = payload.user && payload.user.user_id

  const roleName = payload.role && payload.role.name

  console.log("[org-fga-sync] received event:", { eventType, orgId, userId, roleName })

  if (!orgId || !userId) {
    console.log("[org-fga-sync] missing organization id or user id — skipping")
    return
  }
  const handled = [
    "organization.member.added",
    "organization.member.deleted",
    "organization.member.role.assigned",
    "organization.member.role.deleted",
  ]
  if (!handled.includes(eventType)) {
    console.log("[org-fga-sync] unhandled event type — skipping:", eventType)
    return
  }
  const isRoleEvent = eventType.startsWith("organization.member.role.")
  if (isRoleEvent && roleName !== (event.secrets.ORG_ADMIN_ROLE_NAME || "admin")) {
    console.log("[org-fga-sync] role is not the admin role — skipping:", roleName)
    return
  }

  const domain = event.secrets.AUTH0_DOMAIN
  let orgSlug
  try {
    const managementToken = await getManagementToken(
      domain,
      event.secrets.AUTH0_MGMT_CLIENT_ID,
      event.secrets.AUTH0_MGMT_CLIENT_SECRET,
    )
    orgSlug = await getOrganizationFgaSlug(domain, managementToken, orgId)
  } catch (error) {
    console.error("[org-fga-sync] organization lookup failed:", error)
    return
  }

  const fgaClient = new OpenFgaClient({
    apiUrl: event.secrets.FGA_API_URL,
    storeId: event.secrets.FGA_STORE_ID,
    authorizationModelId: event.secrets.FGA_MODEL_ID || undefined,
    credentials: {
      method: CredentialsMethod.ClientCredentials,
      config: {
        apiTokenIssuer: event.secrets.FGA_API_TOKEN_ISSUER,
        apiAudience: event.secrets.FGA_API_AUDIENCE,
        clientId: event.secrets.FGA_CLIENT_ID,
        clientSecret: event.secrets.FGA_CLIENT_SECRET,
      },
    },
  })

  const object = `organization:${orgSlug}`
  const memberTuple = { user: `user:${userId}`, relation: "member", object }
  const adminTuple = { user: `user:${userId}`, relation: "admin", object }

  // Idempotent both ways: a tuple may already exist (e.g. seeded by
  // scripts/provision-partner-org.mjs) or already be gone, which FGA
  // otherwise rejects.
  const write = (tuples) =>
    fgaClient.write({ writes: tuples }, { conflict: { onDuplicateWrites: "ignore" } })
  const remove = (tuples) =>
    fgaClient.write({ deletes: tuples }, { conflict: { onMissingDeletes: "ignore" } })

  try {
    if (eventType === "organization.member.added") {
      console.log("[org-fga-sync] writing member tuple:", memberTuple)
      await write([memberTuple])
    } else if (eventType === "organization.member.deleted") {
      console.log("[org-fga-sync] deleting member and admin tuples:", memberTuple, adminTuple)
      await remove([memberTuple, adminTuple])
    } else if (eventType === "organization.member.role.assigned") {
      console.log("[org-fga-sync] writing admin tuple:", adminTuple)
      await write([adminTuple])
    } else {
      console.log("[org-fga-sync] deleting admin tuple:", adminTuple)
      await remove([adminTuple])
    }
  } catch (error) {
    console.error("[org-fga-sync] FGA write failed:", error)
  }
}
