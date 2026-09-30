import "server-only"
import { getCanonicalDomain } from "@/lib/auth0"

export class ManagementApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "ManagementApiError"
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getManagementApiToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  // This app's own Regular Web Application client — authorized tenant-side
  // for a client_credentials grant against the Management API
  // (read/create/update:organizations). Not a separate M2M application.
  const clientId = process.env.AUTH0_CLIENT_ID ?? ""
  const clientSecret = process.env.AUTH0_CLIENT_SECRET ?? ""
  if (!clientId || !clientSecret) {
    throw new ManagementApiError("AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET are not configured")
  }

  const domain = getCanonicalDomain()
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string }
    throw new ManagementApiError(
      err.error_description ?? err.error ?? `Failed to get Management API token (${res.status})`,
      res.status,
    )
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new ManagementApiError("Management API token response is missing access_token")
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 86400) * 1000,
  }
  return cachedToken.token
}

async function mgmtFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getManagementApiToken()
  const domain = getCanonicalDomain()
  const res = await fetch(`https://${domain}/api/v2${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    const err = (JSON.parse(body || "{}") as { message?: string; error?: string }) ?? {}
    throw new ManagementApiError(
      err.message ?? err.error ?? `Management API ${options.method ?? "GET"} ${path} failed (${res.status})`,
      res.status,
    )
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export interface Organization {
  id: string
  name: string
  display_name?: string
  metadata?: Record<string, string>
}

export async function getOrganizationByName(name: string): Promise<Organization | null> {
  try {
    return await mgmtFetch<Organization>(`/organizations/name/${encodeURIComponent(name)}`)
  } catch {
    return null
  }
}

// The portal derives which organization a partner admin belongs to from
// their own session's org_id claim (never a hardcoded org) — this looks up
// that organization's own record, including its metadata, which is where
// per-partner config (which backend serves its stock, etc.) lives instead
// of an env var naming one specific partner.
export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  try {
    return await mgmtFetch<Organization>(`/organizations/${encodeURIComponent(orgId)}`)
  } catch {
    return null
  }
}

export async function createOrganization(
  name: string,
  displayName: string,
  metadata?: Record<string, string>,
): Promise<Organization> {
  return mgmtFetch<Organization>("/organizations", {
    method: "POST",
    body: JSON.stringify({ name, display_name: displayName, metadata }),
  })
}

export interface OrganizationConnection {
  connection_id: string
  assign_membership_on_login: boolean
  connection: { name: string; strategy: string }
}

export async function getOrganizationConnections(orgId: string): Promise<OrganizationConnection[]> {
  return mgmtFetch<OrganizationConnection[]>(`/organizations/${orgId}/enabled_connections`)
}

export async function enableConnectionForOrganization(
  orgId: string,
  connectionId: string,
  assignMembershipOnLogin = true,
): Promise<OrganizationConnection> {
  return mgmtFetch<OrganizationConnection>(`/organizations/${orgId}/enabled_connections`, {
    method: "POST",
    body: JSON.stringify({ connection_id: connectionId, assign_membership_on_login: assignMembershipOnLogin }),
  })
}

export async function removeConnectionFromOrganization(orgId: string, connectionId: string): Promise<void> {
  await mgmtFetch<void>(`/organizations/${orgId}/enabled_connections/${connectionId}`, { method: "DELETE" })
}

/**
 * Creates a demo enterprise (SAML) connection and enables it for an
 * organization in one call. Reference/setup-script use only — the portal's
 * own "Configure SSO" flow uses createSsoTicket (below) instead, which lets
 * the partner self-configure their own IdP rather than this app minting a
 * placeholder one on their behalf.
 */
export async function createSamlConnection(data: {
  name: string
  signInUrl: string
  x509cert: string
  orgId: string
  assignMembershipOnLogin?: boolean
}): Promise<{ id: string; name: string }> {
  const connection = await mgmtFetch<{ id: string; name: string }>("/connections", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      strategy: "samlp",
      options: { signInEndpoint: data.signInUrl, signingCert: data.x509cert, protocol: "samlp" },
    }),
  })
  await enableConnectionForOrganization(data.orgId, connection.id, data.assignMembershipOnLogin ?? true)
  return connection
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await mgmtFetch<void>(`/connections/${connectionId}`, { method: "DELETE" })
}

/**
 * Auth0's Self-Service SSO flow: mints a one-time ticket URL an org admin
 * can open to configure their own enterprise connection against this
 * organization, without this app ever holding their IdP's credentials.
 * Requires AUTH0_SSP_ID — the id of a Self-Service Profile configured
 * tenant-side (Authentication > Enterprise > Self-Service SSO).
 */
export async function createSsoTicket(orgId: string, ttlSec = 3600): Promise<{ ticket_url: string }> {
  const profileId = process.env.AUTH0_SSP_ID
  if (!profileId) throw new ManagementApiError("AUTH0_SSP_ID is not set")
  return mgmtFetch<{ ticket_url: string }>(`/self-service-profiles/${profileId}/sso-ticket`, {
    method: "POST",
    body: JSON.stringify({
      connection_config: { name: `sso-${orgId.replace(/^org_/, "")}-${Date.now().toString(36)}` },
      enabled_organizations: [{ organization_id: orgId }],
      domain_aliases_config: { domain_verification: "optional" },
      use_for_organization_discovery: true,
      ttl_sec: ttlSec,
    }),
  })
}

export interface OrganizationMember {
  user_id: string
  email?: string
  name?: string
  picture?: string
}

export async function listOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
  return mgmtFetch<OrganizationMember[]>(`/organizations/${orgId}/members`)
}

export async function addOrganizationMember(orgId: string, userId: string): Promise<void> {
  await mgmtFetch<void>(`/organizations/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify({ members: [userId] }),
  })
}
