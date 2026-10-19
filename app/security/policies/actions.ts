"use server"

import { revalidatePath } from "next/cache"
import { isOrganizationAdmin } from "@/lib/fga"
import { getPartnerContext } from "@/lib/partner-context"
import { updateOrganizationMetadata } from "@/lib/auth0-management"
import { METADATA_VALUE_MAX, sanitizePolicy, type SecurityPolicy } from "@/lib/security-policy"

export async function saveSecurityPolicy(
  policy: SecurityPolicy,
  factors: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const context = await getPartnerContext()
    if (!(await isOrganizationAdmin(context.userId, context.fgaSlug))) {
      return { ok: false, error: "Only organization admins can change security policies" }
    }

    const clean = sanitizePolicy(policy, factors)
    const securityPolicy = JSON.stringify(clean.policy)
    const factorsJson = JSON.stringify(clean.factors)
    if (securityPolicy.length > METADATA_VALUE_MAX) {
      return {
        ok: false,
        error: `Policy is too long to store (${securityPolicy.length}/${METADATA_VALUE_MAX} characters) — shorten the IP lists.`,
      }
    }

    await updateOrganizationMetadata(context.orgId, { securityPolicy, factors: factorsJson })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to save security policy" }
  }
  revalidatePath("/security/policies")
  return { ok: true }
}
