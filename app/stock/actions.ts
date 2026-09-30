"use server"

import { revalidatePath } from "next/cache"
import { checkProductLineAccess } from "@/lib/fga"
import { updatePartnerStockQuantity } from "@/lib/partner-stock-client"
import { getPartnerContext, PartnerContextError } from "@/lib/partner-context"

export async function updateStockQuantity(
  productId: string,
  productLine: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, error: "Quantity must be a non-negative number" }
  }

  let context
  try {
    context = await getPartnerContext()
  } catch (error) {
    return { ok: false, error: error instanceof PartnerContextError ? error.message : "Not signed in" }
  }

  const canManage = await checkProductLineAccess(context.userId, context.fgaSlug, productLine, "manager")
  console.log("[portal/stock] update attempt:", {
    sub: context.userId,
    orgId: context.orgId,
    productId,
    productLine,
    quantity,
    canManage,
  })
  if (!canManage) {
    return { ok: false, error: `You do not have manage access to product line "${productLine}"` }
  }

  try {
    await updatePartnerStockQuantity(context.stockApiBaseUrl, context.stockApiAudience, productId, quantity)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update stock"
    return { ok: false, error: message }
  }

  revalidatePath("/stock")
  return { ok: true }
}
