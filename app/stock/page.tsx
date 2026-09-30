import { checkProductLineAccess } from "@/lib/fga"
import { listPartnerStock } from "@/lib/partner-stock-client"
import { getPartnerContext, PartnerContextError } from "@/lib/partner-context"
import { StockTable, type StockRow } from "@/components/stock-table"

// `category` is this demo's stand-in for "product line" — Veridian's own
// products table (scripts/001_create_products.sql in the v0-veridian repo)
// already has it; any other partner's stock API just needs to return the
// same { id, name, sku, category, stock_quantity } shape.
export default async function PortalStockPage() {
  let rows: StockRow[] = []
  let loadError: string | null = null

  try {
    const context = await getPartnerContext()
    const items = await listPartnerStock(context.stockApiBaseUrl, context.stockApiAudience)
    const lines = Array.from(new Set(items.map((item) => item.category)))
    const canManageByLine = new Map<string, boolean>()
    const canViewByLine = new Map<string, boolean>()
    await Promise.all(
      lines.map(async (line) => {
        const [canManage, canView] = await Promise.all([
          checkProductLineAccess(context.userId, context.fgaSlug, line, "manager"),
          checkProductLineAccess(context.userId, context.fgaSlug, line, "viewer"),
        ])
        canManageByLine.set(line, canManage)
        canViewByLine.set(line, canManage || canView)
      }),
    )
    rows = items
      .filter((item) => canViewByLine.get(item.category))
      .map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        productLine: item.category,
        quantity: item.stock_quantity,
        canManage: canManageByLine.get(item.category) ?? false,
      }))
  } catch (error) {
    loadError =
      error instanceof PartnerContextError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to load stock"
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Stock</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Product lines you can view or manage, delegated by Auth0 FGA relationship tuples scoped to your account.
      </p>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : <StockTable rows={rows} />}
    </div>
  )
}
