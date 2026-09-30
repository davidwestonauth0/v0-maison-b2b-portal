"use server"

import { listOrganizationMembers } from "@/lib/auth0-management"
import { checkProductLineAccess, type ProductLineRelation } from "@/lib/fga"
import { listPartnerStock } from "@/lib/partner-stock-client"
import { getPartnerContext } from "@/lib/partner-context"

export interface MemberGrantRow {
  userId: string
  email: string
  grants: Record<string, ProductLineRelation | "none">
}

export interface ProductLineGrantsData {
  productLines: string[]
  members: MemberGrantRow[]
}

export async function loadProductLineGrants(): Promise<ProductLineGrantsData> {
  const context = await getPartnerContext()

  const [stock, members] = await Promise.all([
    listPartnerStock(context.stockApiBaseUrl, context.stockApiAudience),
    listOrganizationMembers(context.orgId),
  ])
  const productLines = Array.from(new Set(stock.map((item) => item.category)))

  const rows: MemberGrantRow[] = await Promise.all(
    members.map(async (member) => {
      const grants: Record<string, ProductLineRelation | "none"> = {}
      await Promise.all(
        productLines.map(async (line) => {
          const isManager = await checkProductLineAccess(member.user_id, context.fgaSlug, line, "manager")
          if (isManager) {
            grants[line] = "manager"
            return
          }
          const isViewer = await checkProductLineAccess(member.user_id, context.fgaSlug, line, "viewer")
          grants[line] = isViewer ? "viewer" : "none"
        }),
      )
      return { userId: member.user_id, email: member.email ?? member.user_id, grants }
    }),
  )

  return { productLines, members: rows }
}
