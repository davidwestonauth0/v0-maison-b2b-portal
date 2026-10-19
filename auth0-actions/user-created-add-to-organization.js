/**
 * Reference only — not deployed by this app. Bind to an Event Stream
 * subscribed to user.created (same place as
 * organization-member-fga-tuple-sync.js: Monitoring > Event Streams > "Actions"
 * delivery, or the Event Stream trigger under Actions > Flows).
 *
 * Enterprise-connection users (connection names like
 * "ec-org-<orgIdSuffix>-<IdpName>") are created by Auth0 on first federated
 * login but are not automatically members of the organization the connection
 * belongs to. This Action reads the organization id out of the user's id and
 * adds them as a member through the Management API.
 *
 *   user_id:  okta|ec-org-kRLNfeehwEql8kiT-OktaHaverstone|00u18r5x95rYXGWRS698
 *   org id:   org_kRLNfeehwEql8kiT
 *
 * Only users whose id contains "ec-org-<id>-" are handled; every other
 * user.created event is skipped.
 *
 * Adding the member fires organization.member.added, which
 * organization-member-fga-tuple-sync.js turns into the FGA "member" tuple.
 *
 * Role assignment is not done here: org roles are assigned automatically from
 * enterprise groups. post-login-org-roles-claim.js puts them in the tokens.
 *
 * Requires these secrets (Actions > Library > this action > Secrets):
 *   AUTH0_DOMAIN — this tenant's canonical domain (the Management API isn't
 *   served on a custom domain)
 *   AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET — a client authorized for a
 *   client_credentials grant against the Management API with
 *   create:organization_members.
 *
 * @param {Event} event
 */

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

// "okta|ec-org-kRLNfeehwEql8kiT-OktaHaverstone|00u..." -> "org_kRLNfeehwEql8kiT"
function getOrganizationId(userId) {
  const match = /ec-org-([A-Za-z0-9]+)-/.exec(userId || "")
  return match ? `org_${match[1]}` : null
}

exports.onExecuteEventStream = async (event) => {
  const message = event.message || {}
  const eventType = message.type
  const user = (message.data && message.data.object) || {}
  const userId = user.user_id

  console.log("[user-created-org] received event:", { eventType, userId })

  if (eventType !== "user.created") {
    console.log("[user-created-org] unhandled event type — skipping:", eventType)
    return
  }

  const orgId = getOrganizationId(userId)
  if (!userId || !orgId) {
    console.log("[user-created-org] not an ec-org user — skipping")
    return
  }

  const domain = event.secrets.AUTH0_DOMAIN
  try {
    const token = await getManagementToken(
      domain,
      event.secrets.AUTH0_MGMT_CLIENT_ID,
      event.secrets.AUTH0_MGMT_CLIENT_SECRET,
    )

    const res = await fetch(`https://${domain}/api/v2/organizations/${encodeURIComponent(orgId)}/members`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ members: [userId] }),
    })

    if (res.ok) {
      console.log("[user-created-org] added member:", { orgId, userId })
    } else if (res.status === 409) {
      console.log("[user-created-org] already a member — nothing to do:", { orgId, userId })
    } else {
      console.error(`[user-created-org] add member failed (${res.status}):`, await res.text())
      return
    }
  } catch (error) {
    console.error("[user-created-org] failed:", error)
  }
}
