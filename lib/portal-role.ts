import "server-only"
import { auth0 } from "@/lib/auth0"

// Custom claim the tenant's Post-Login Action puts the user's Auth0 roles in
// (see lib/auth0.ts's beforeSessionSaved, which keeps it in the session).
export const ROLES_CLAIM = process.env.ROLES_CLAIM || "https://login.maison.westondemos.co.uk/roles"
export const ADMIN_ROLE = process.env.ORG_ADMIN_ROLE_NAME || "admin"

/** True if the signed-in user holds the partner-org admin role. */
export async function isPortalAdmin(): Promise<boolean> {
  if (!auth0) return false
  const session = await auth0.getSession()
  const roles = session?.user?.[ROLES_CLAIM]
  return Array.isArray(roles) && roles.includes(ADMIN_ROLE)
}
