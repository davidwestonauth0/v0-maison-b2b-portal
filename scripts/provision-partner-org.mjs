#!/usr/bin/env node
// Provisions (or updates) a partner's Auth0 Organization for this partner
// portal (app/**) — org metadata pointing at that partner's own stock API,
// and seed FGA tuples. Generic: run once per partner, not tied to any one
// partner's name. Not deployed/run automatically — same "reference, run by
// hand" spirit as auth0-actions/*.js — because this creates tenant-level
// state (an Organization, its metadata) that shouldn't happen on every app
// boot.
//
// The portal itself never hardcodes a partner: app/layout.tsx derives
// which organization a logged-in employee belongs to from their own
// session's org_id claim, then reads that organization's metadata
// (lib/partner-context.ts) for stock_api_base_url/stock_api_audience and an
// optional fga_slug. This script is what writes that metadata.
//
// Usage:
//   node scripts/provision-partner-org.mjs \
//     --name veridian --display-name Veridian \
//     --stock-api-base-url https://veridian.westondemos.co.uk \
//     --stock-api-audience https://veridian.westondemos.co.uk/api/portal \
//     [--products-api-url https://veridian.westondemos.co.uk/api/products] \
//     [--admin-user-id auth0|...] \
//     [--grant-id <id of the client grant (Auth0 Management API /client-grants) linking the partner's
//                  application to its API audience, to enable for this org>]
//
// Requires the same AUTH0_CLIENT_ID/SECRET as lib/auth0-management.ts
// (this app's regular web app client, authorized tenant-side for the
// Management API), plus FGA_* (lib/fga.ts).

import { OpenFgaClient, CredentialsMethod } from "@openfga/sdk"

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2)
      args[key] = argv[i + 1]
      i++
    }
  }
  return args
}

function requireArg(args, name) {
  const value = args[name]
  if (!value) throw new Error(`Missing required --${name} argument`)
  return value
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

function getCanonicalDomain() {
  const canonical = process.env.AUTH0_CANONICAL_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH0_DOMAIN || ""
  return canonical.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

async function getManagementToken() {
  const domain = getCanonicalDomain()
  // Same client this app's own lib/auth0-management.ts reuses for the
  // Management API (getManagementApiToken) — this app's regular web app
  // client, authorized tenant-side for a client_credentials grant against
  // the Management API. Not a separate M2M application.
  const clientId = requireEnv("AUTH0_CLIENT_ID")
  const clientSecret = requireEnv("AUTH0_CLIENT_SECRET")
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  })
  if (!res.ok) throw new Error(`Management API token request failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

async function mgmtFetch(token, path, options = {}) {
  const domain = getCanonicalDomain()
  const res = await fetch(`https://${domain}/api/v2${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!res.ok) throw new Error(`Management API ${options.method ?? "GET"} ${path} failed (${res.status}): ${await res.text()}`)
  if (res.status === 204) return undefined
  return res.json()
}

async function ensureOrganization(token, orgName, displayName, metadata) {
  let org
  try {
    org = await mgmtFetch(token, `/organizations/name/${encodeURIComponent(orgName)}`)
    console.log(`[provision] organization "${orgName}" already exists:`, org.id)
    console.log(`[provision] updating metadata`)
    org = await mgmtFetch(token, `/organizations/${org.id}`, {
      method: "PATCH",
      body: JSON.stringify({ display_name: displayName, metadata }),
    })
  } catch {
    console.log(`[provision] creating organization "${orgName}"`)
    org = await mgmtFetch(token, "/organizations", {
      method: "POST",
      body: JSON.stringify({ name: orgName, display_name: displayName, metadata }),
    })
  }
  return org
}

async function ensureClientEnabled(token, orgId, grantId) {
  if (!grantId) {
    console.log("[provision] --grant-id not given — skipping client-grant enablement")
    return
  }
  console.log(`[provision] enabling client grant ${grantId} for organization ${orgId}`)
  await mgmtFetch(token, `/organizations/${orgId}/client-grants`, {
    method: "POST",
    body: JSON.stringify({ grant_id: grantId }),
  }).catch((err) => console.log("[provision] client-grants enable skipped/failed (may already exist):", err.message))

  console.log(
    "[provision] NOTE: enabling an enterprise (SAML/OIDC) connection for this org is left as a manual dashboard " +
      "step, or use the portal's own /portal/security/idp-management self-service UI once an admin can log in.",
  )
}

async function fetchProductLines(productsApiUrl) {
  if (!productsApiUrl) {
    console.log("[provision] --products-api-url not given — using placeholder product lines")
    return ["Women", "Men", "Accessories", "Shoes"]
  }
  const res = await fetch(productsApiUrl)
  if (!res.ok) throw new Error(`Failed to fetch products from ${productsApiUrl} (${res.status})`)
  const body = await res.json()
  return Array.from(new Set(body.data.map((item) => item.category)))
}

function getFgaClient() {
  return new OpenFgaClient({
    apiUrl: requireEnv("FGA_API_URL"),
    storeId: requireEnv("FGA_STORE_ID"),
    authorizationModelId: process.env.FGA_MODEL_ID || undefined,
    credentials: process.env.FGA_CLIENT_ID
      ? {
          method: CredentialsMethod.ClientCredentials,
          config: {
            apiTokenIssuer: requireEnv("FGA_API_TOKEN_ISSUER"),
            apiAudience: requireEnv("FGA_API_AUDIENCE"),
            clientId: requireEnv("FGA_CLIENT_ID"),
            clientSecret: requireEnv("FGA_CLIENT_SECRET"),
          },
        }
      : undefined,
  })
}

async function seedFgaTuples(fgaSlug, productLines, adminUserId) {
  const fga = getFgaClient()
  const writes = []

  if (adminUserId) {
    writes.push({ user: `user:${adminUserId}`, relation: "admin", object: `organization:${fgaSlug}` })
    writes.push({ user: `user:${adminUserId}`, relation: "member", object: `organization:${fgaSlug}` })
    console.log(`[provision] seeding org-admin tuple for ${adminUserId}`)
  } else {
    console.log("[provision] --admin-user-id not given — skipping admin tuple seed")
  }

  // The model's `manager: [user] or admin from parent_org` clause makes org
  // admins managers of every product_line automatically — but only once
  // each product_line actually has a parent_org tuple pointing at this
  // organization. Without this, "admin from parent_org" has nothing to
  // resolve against and org-wide inheritance silently grants nothing.
  for (const line of productLines) {
    writes.push({ user: `organization:${fgaSlug}`, relation: "parent_org", object: `product_line:${fgaSlug}/${encodeURIComponent(line)}` })
  }
  console.log(`[provision] seeding parent_org tuples for product lines: ${productLines.join(", ")}`)

  if (writes.length === 0) {
    console.log("[provision] nothing to write to FGA")
    return
  }
  await fga.write({ writes })
  console.log(`[provision] wrote ${writes.length} FGA tuples`)
}

async function main() {
  const args = parseArgs()
  const orgName = requireArg(args, "name")
  const displayName = args["display-name"] || orgName
  const stockApiBaseUrl = requireArg(args, "stock-api-base-url")
  const stockApiAudience = requireArg(args, "stock-api-audience")
  const fgaSlug = args["fga-slug"] || orgName

  const metadata = {
    stock_api_base_url: stockApiBaseUrl,
    stock_api_audience: stockApiAudience,
    fga_slug: fgaSlug,
  }

  const token = await getManagementToken()
  const org = await ensureOrganization(token, orgName, displayName, metadata)
  await ensureClientEnabled(token, org.id, args["grant-id"])
  const productLines = await fetchProductLines(args["products-api-url"])
  await seedFgaTuples(fgaSlug, productLines, args["admin-user-id"])

  console.log("[provision] done. Organization id:", org.id)
  console.log(`[provision] a member logs in via: /auth/login?organization=${org.id}&returnTo=/portal`)
}

main().catch((err) => {
  console.error("[provision] failed:", err)
  process.exit(1)
})
