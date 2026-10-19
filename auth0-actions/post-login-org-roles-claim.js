/**
 * Reference only — not deployed by this app. Paste into a Post-Login Action
 * (Actions > Flows > Login) and add it to the flow.
 *
 * Puts the user's roles on the ID and access token as a namespaced custom
 * claim. When the login is in an organization context and the user has roles
 * in that organization, those ORGANIZATION roles are used; otherwise it falls
 * back to the user's top-level (tenant) roles, event.authorization.roles. The
 * organization roles replace the top-level ones, they are not merged.
 *
 * Organization roles are read from the Management API
 * (GET /organizations/{id}/members/{user_id}/roles) because the Post-Login
 * event object does not list them separately from the user's other roles. The
 * Management API token is cached in api.cache between logins.
 *
 * The portal reads this claim in lib/portal-role.ts (ROLES_CLAIM /
 * ORG_ADMIN_ROLE_NAME) to show the Team and Security pages to admins, and
 * lib/auth0.ts keeps it in the session.
 *
 * Requires these secrets (Actions > Library > this action > Secrets):
 *   ROLES_CLAIM_NAMESPACE — claim name, e.g.
 *   https://login.maison.westondemos.co.uk/roles (must match the portal's
 *   ROLES_CLAIM)
 *   AUTH0_DOMAIN — this tenant's canonical domain (the Management API isn't
 *   served on a custom domain)
 *   AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET — a client authorized for a
 *   client_credentials grant against the Management API with
 *   read:organization_member_roles.
 *
 * @param {Event} event
 * @param {PostLoginAPI} api
 */

async function getManagementToken(event, api) {
  const cached = api.cache.get("mgmt-token")
  if (cached && cached.value) return cached.value

  const domain = event.secrets.AUTH0_DOMAIN
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: event.secrets.AUTH0_MGMT_CLIENT_ID,
      client_secret: event.secrets.AUTH0_MGMT_CLIENT_SECRET,
      audience: `https://${domain}/api/v2/`,
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Management API token request failed (${res.status}): ${body}`)
  const { access_token: token, expires_in: expiresIn } = JSON.parse(body)
  // Keep it a minute shorter than its lifetime.
  api.cache.set("mgmt-token", token, { ttl: Math.max(((expiresIn || 3600) - 60) * 1000, 1000) })
  return token
}

async function getOrganizationRoleNames(event, api) {
  const token = await getManagementToken(event, api)
  const domain = event.secrets.AUTH0_DOMAIN
  const res = await fetch(
    `https://${domain}/api/v2/organizations/${encodeURIComponent(event.organization.id)}` +
      `/members/${encodeURIComponent(event.user.user_id)}/roles?per_page=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const body = await res.text()
  if (!res.ok) throw new Error(`Organization member roles lookup failed (${res.status}): ${body}`)
  return JSON.parse(body).map((role) => role.name)
}

exports.onExecutePostLogin = async (event, api) => {
  const namespace = event.secrets.ROLES_CLAIM_NAMESPACE
  const topLevelRoles = (event.authorization && event.authorization.roles) || []

  let roles = topLevelRoles
  let source = "tenant"

  if (event.organization && event.organization.id) {
    try {
      const orgRoles = await getOrganizationRoleNames(event, api)
      if (orgRoles.length > 0) {
        roles = orgRoles
        source = "organization"
      }
    } catch (error) {
      // Fall back to the top-level roles rather than failing the login.
      console.error("[org-roles-claim] organization roles lookup failed, using tenant roles:", error)
    }
  }

  console.log("[org-roles-claim] setting claim:", {
    userId: event.user && event.user.user_id,
    orgId: event.organization && event.organization.id,
    source,
    roles,
  })

  api.idToken.setCustomClaim(namespace, roles)
  api.accessToken.setCustomClaim(namespace, roles)
}
