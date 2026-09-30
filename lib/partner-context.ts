import "server-only"
import { auth0 } from "@/lib/auth0"
import { getOrganizationById, type Organization } from "@/lib/auth0-management"

// The portal is not built for one specific partner — a logged-in employee's
// own organization membership (org_id, a standard claim on session.user
// when the login went through Auth0 Organizations) is what determines who
// they are and what they can see. Per-partner configuration that used to be
// env vars (which backend serves this org's stock, the FGA object-id slug
// to use) instead lives on the Auth0 Organization's own `metadata` — so
// onboarding a second partner is "create an Organization with this
// metadata," not a code or env var change.
export interface PartnerContext {
  userId: string
  orgId: string
  organization: Organization
  /** Slug used inside FGA object identifiers (organization:<slug>, product_line:<slug>:<line>). Falls back to org_id if metadata.fga_slug isn't set. */
  fgaSlug: string
  /** Base URL of this partner's own Next.js app, whose /api/portal/stock this portal calls server-to-server. */
  stockApiBaseUrl: string
  /** Audience of the M2M token this portal must present to that partner's stock API. */
  stockApiAudience: string
}

export class PartnerContextError extends Error {}

/**
 * Resolves the logged-in user's own organization context — never a
 * hardcoded partner. Throws if the user has no org_id, or if that
 * organization hasn't been configured with the metadata this portal needs.
 */
export async function getPartnerContext(): Promise<PartnerContext> {
  if (!auth0) throw new PartnerContextError("Auth0 is not configured")
  const session = await auth0.getSession()
  const userId = session?.user?.sub
  const orgId = session?.user?.org_id
  if (!userId) throw new PartnerContextError("Not signed in")
  if (!orgId) throw new PartnerContextError("Your account is not a member of a partner organization")

  const organization = await getOrganizationById(orgId)
  if (!organization) throw new PartnerContextError(`Organization ${orgId} could not be found`)

  const metadata = organization.metadata ?? {}
  const stockApiBaseUrl = metadata.stock_api_base_url
  const stockApiAudience = metadata.stock_api_audience
  if (!stockApiBaseUrl || !stockApiAudience) {
    throw new PartnerContextError(
      `Organization "${organization.display_name ?? organization.name}" is missing stock_api_base_url/` +
        "stock_api_audience metadata — see scripts/provision-partner-org.mjs for how to set it.",
    )
  }

  return {
    userId,
    orgId,
    organization,
    fgaSlug: metadata.fga_slug || orgId,
    stockApiBaseUrl,
    stockApiAudience,
  }
}
