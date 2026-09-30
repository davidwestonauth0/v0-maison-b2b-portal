"use server"

import { revalidatePath } from "next/cache"
import { deleteProductLineGrant, isOrganizationAdmin, writeProductLineGrant } from "@/lib/fga"
import { getPartnerContext } from "@/lib/partner-context"

async function requireOrgAdmin(): Promise<{ fgaSlug: string }> {
  const context = await getPartnerContext()
  if (!(await isOrganizationAdmin(context.userId, context.fgaSlug))) {
    throw new Error("Only organization admins can change product-line assignments")
  }
  return context
}

export async function grantProductLineAccess(
  memberUserId: string,
  productLine: string,
  relation: "viewer" | "manager",
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { fgaSlug } = await requireOrgAdmin()
    await writeProductLineGrant(memberUserId, fgaSlug, productLine, relation)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to grant access" }
  }
  revalidatePath("/team")
  return { ok: true }
}

export async function revokeProductLineAccess(
  memberUserId: string,
  productLine: string,
  relation: "viewer" | "manager",
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { fgaSlug } = await requireOrgAdmin()
    await deleteProductLineGrant(memberUserId, fgaSlug, productLine, relation)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to revoke access" }
  }
  revalidatePath("/team")
  return { ok: true }
}
