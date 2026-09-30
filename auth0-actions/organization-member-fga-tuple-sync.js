/**
 * Reference only — not deployed by this app. Bind to an Event Stream
 * (Actions > Library > Flows/Triggers isn't the right place — this is an
 * Event Stream-bound Action, configured under Monitoring > Event Streams >
 * create a stream > "Actions" delivery, or Actions > Flows > "Event Stream"
 * trigger depending on dashboard version) subscribed to
 * organization.member.added and organization.member.deleted.
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
 * Writes/deletes the FGA "member" relation tuple this app's own
 * lib/fga.ts (isOrganizationAdmin / checkProductLineAccess's org-admin
 * inheritance) depends on — organization:<slug>#member@user:<user_id>.
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
  // event.message.data, not event.data directly. Verify the exact shape of
  // data.organization/data.user against a live test event in the Dashboard
  // before relying on this in production — Auth0's own reference doesn't
  // publish a filled-in example for this specific event type as of writing.
  const message = event.message || {}
  const eventType = message.type
  const data = message.data || {}
  const orgId = data.organization && data.organization.id
  const userId = data.user && data.user.user_id

  console.log("[org-fga-sync] received event:", { eventType, orgId, userId })

  if (!orgId || !userId) {
    console.log("[org-fga-sync] missing organization id or user id — skipping")
    return
  }
  if (eventType !== "organization.member.added" && eventType !== "organization.member.deleted") {
    console.log("[org-fga-sync] unhandled event type — skipping:", eventType)
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

  const tuple = { user: `user:${userId}`, relation: "member", object: `organization:${orgSlug}` }

  try {
    if (eventType === "organization.member.added") {
      console.log("[org-fga-sync] writing member tuple:", tuple)
      await fgaClient.write({ writes: [tuple] })
    } else {
      console.log("[org-fga-sync] deleting member tuple:", tuple)
      await fgaClient.write({ deletes: [tuple] })
    }
  } catch (error) {
    console.error("[org-fga-sync] FGA write failed:", error)
  }
}
