import "server-only"

// M2M client-credentials call from this portal into a partner's own
// /api/portal/stock route — independent Next.js deployments on the same
// Auth0 tenant, talking to each other over HTTP as peers (mirrors the
// existing Veridian ↔ Maison PAR/DPoP credit-approval flow between those
// two apps, just M2M rather than user-facing). Which partner and which base
// URL/audience is never hardcoded here — callers pass the values resolved
// from that partner's own Organization metadata (lib/partner-context.ts),
// so this client works for any partner.
//
// This client does NOT decide which product lines the caller may see or
// edit — that's enforced entirely by this portal's own FGA check before any
// of these functions are called. Each partner's route independently checks
// its own manage:stock scope; it has no knowledge of this portal's per-line
// FGA grants.

const PORTAL_M2M_CLIENT_ID = process.env.PORTAL_M2M_CLIENT_ID || ""
const PORTAL_M2M_CLIENT_SECRET = process.env.PORTAL_M2M_CLIENT_SECRET || ""

// Cached per audience — this app's single M2M application is expected to be
// authorized (via a Client Grant) for every partner's stock API audience.
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getPartnerToken(audience: string): Promise<string> {
  const domain = process.env.AUTH0_CANONICAL_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH0_DOMAIN || ""
  if (!domain || !PORTAL_M2M_CLIENT_ID || !PORTAL_M2M_CLIENT_SECRET) {
    throw new Error(
      "Partner portal M2M client is not configured. Set PORTAL_M2M_CLIENT_ID and PORTAL_M2M_CLIENT_SECRET " +
        "for an M2M application authorized (via a Client Grant) for each partner's stock API audience.",
    )
  }
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")

  const cached = tokenCache.get(audience)
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token
  }

  const res = await fetch(`https://${cleanDomain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: PORTAL_M2M_CLIENT_ID,
      client_secret: PORTAL_M2M_CLIENT_SECRET,
      audience,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Partner stock API token request failed for audience ${audience} (${res.status}): ${body}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache.set(audience, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 })
  return data.access_token
}

export interface PartnerStockItem {
  id: string
  name: string
  sku: string
  category: string
  subcategory: string | null
  stock_quantity: number
}

export async function listPartnerStock(baseUrl: string, audience: string): Promise<PartnerStockItem[]> {
  const token = await getPartnerToken(audience)
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/portal/stock`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`Partner stock list failed (${res.status})`)
  }
  const body = (await res.json()) as { data: PartnerStockItem[] }
  return body.data
}

export async function updatePartnerStockQuantity(
  baseUrl: string,
  audience: string,
  productId: string,
  quantity: number,
): Promise<void> {
  const token = await getPartnerToken(audience)
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/portal/stock/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ stock_quantity: quantity }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Partner stock update failed (${res.status}): ${body}`)
  }
}
