import { SecurityPolicyForm } from "@/components/security-policy-form"
import { getPartnerContext } from "@/lib/partner-context"
import { readSecurityPolicy } from "@/lib/security-policy"

// Stores the organization's MFA / session / IP policy in its Auth0
// Organization metadata (securityPolicy, factors). This page only edits the
// settings — nothing in this portal enforces them. Enforcement belongs in a
// Post-Login Action that reads event.organization.metadata (MFA challenge,
// step-up, IP allow/deny, session lifetimes).
export default async function SecurityPoliciesPage() {
  const context = await getPartnerContext()
  const { policy, factors } = readSecurityPolicy(context.organization.metadata)
  return <SecurityPolicyForm initialPolicy={policy} initialFactors={factors.factors} />
}
