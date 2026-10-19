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
//     [--stock-api-token-domain login.veridian.westondemos.co.uk  (domain the partner API validates iss against)] \
//     [--products-api-url https://veridian.westondemos.co.uk/api/products] \
//     [--admin-user-id auth0|...] \
//     [security policy — only written if at least one of these is given; otherwise
//      any policy already saved on the org (e.g. from the portal's Security policies
//      page) is left untouched. Flags override the org's existing policy, or the
//      defaults if it has none:]
//     [--mfa-enforce true|false] [--allow-remember true|false] [--mfa-interval <minutes>] \
//     [--stepup-actions manage:stock,manage:team,manage:security] \
//     [--mfa-factors phone,otp,webauthn-platform,email,recovery-code] \
//     [--ip-allow-list "10.0.0.0/8,192.168.1.0/24"] [--ip-deny-list "..."] \
//     [--session-timeout <minutes>] [--session-idle-timeout <minutes>] \
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

// Mirrors lib/security-policy.ts (DEFAULT_POLICY / DEFAULT_FACTORS / STEPUP_ACTIONS /
// FACTORS). Keep in sync — this script is plain Node and can't import the TS module.
const DEFAULT_POLICY = {
  enforce: false,
  allowRemember: false,
  interval: 15,
  stepupActions: [],
  ipAllowList: "",
  ipDenyList: "",
  sessionTimeout: 120,
  sessionIdleTimeout: 60,
}
const STEPUP_ACTIONS = ["manage:stock", "manage:team", "manage:security"]
const FACTORS = ["phone", "otp", "webauthn-platform", "email", "recovery-code"]
// Auth0 organization metadata values are limited to 255 characters each.
const METADATA_VALUE_MAX = 255

const POLICY_FLAGS = [
  "mfa-enforce",
  "allow-remember",
  "mfa-interval",
  "stepup-actions",
  "mfa-factors",
  "ip-allow-list",
  "ip-deny-list",
  "session-timeout",
  "session-idle-timeout",
]

function parseBool(name, value) {
  if (value === "true") return true
  if (value === "false") return false
  throw new Error(`--${name} must be true or false (got "${value}")`)
}

function parseMinutes(name, value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a whole number of minutes >= 1 (got "${value}")`)
  return n
}

function parseList(name, value, allowed) {
  const items = value.split(",").map((v) => v.trim()).filter(Boolean)
  const unknown = items.filter((v) => !allowed.includes(v))
  if (unknown.length) throw new Error(`--${name}: unknown value(s) ${unknown.join(", ")} (allowed: ${allowed.join(", ")})`)
  return items
}

function safeParse(raw, fallback) {
  try {
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

// Returns { securityPolicy, factors } metadata strings to write, or {} if no policy flag was given.
function buildSecurityMetadata(args, existingMetadata) {
  if (!POLICY_FLAGS.some((flag) => args[flag] !== undefined)) return {}

  const policy = safeParse(existingMetadata?.securityPolicy, DEFAULT_POLICY)
  let factors = safeParse(existingMetadata?.factors, { factors: [] }).factors

  if (args["mfa-enforce"] !== undefined) policy.enforce = parseBool("mfa-enforce", args["mfa-enforce"])
  if (args["allow-remember"] !== undefined) policy.allowRemember = parseBool("allow-remember", args["allow-remember"])
  if (args["mfa-interval"] !== undefined) policy.interval = parseMinutes("mfa-interval", args["mfa-interval"])
  if (args["stepup-actions"] !== undefined) policy.stepupActions = parseList("stepup-actions", args["stepup-actions"], STEPUP_ACTIONS)
  if (args["mfa-factors"] !== undefined) factors = parseList("mfa-factors", args["mfa-factors"], FACTORS)
  if (args["ip-allow-list"] !== undefined) policy.ipAllowList = args["ip-allow-list"].trim()
  if (args["ip-deny-list"] !== undefined) policy.ipDenyList = args["ip-deny-list"].trim()
  if (args["session-timeout"] !== undefined) policy.sessionTimeout = parseMinutes("session-timeout", args["session-timeout"])
  if (args["session-idle-timeout"] !== undefined)
    policy.sessionIdleTimeout = parseMinutes("session-idle-timeout", args["session-idle-timeout"])

  const securityPolicy = JSON.stringify(policy)
  const factorsJson = JSON.stringify({ factors })
  for (const [key, value] of [["securityPolicy", securityPolicy], ["factors", factorsJson]]) {
    if (value.length > METADATA_VALUE_MAX) {
      throw new Error(`${key} is ${value.length} characters; Auth0 metadata values are limited to ${METADATA_VALUE_MAX} — shorten the IP lists`)
    }
  }
  console.log("[provision] writing security policy:", { ...policy, factors })
  return { securityPolicy, factors: factorsJson }
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
  // Ignore tuples that already exist so re-running for the same partner
  // (e.g. to add another admin) doesn't fail the whole atomic write.
  await fga.write({ writes }, { conflict: { onDuplicateWrites: "ignore" } })
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
    ...(args["stock-api-token-domain"] ? { stock_api_token_domain: args["stock-api-token-domain"] } : {}),
    fga_slug: fgaSlug,
  }

  const token = await getManagementToken()

  // Security policy is opt-in; start from whatever the org already has so
  // flags override individual fields instead of resetting the rest.
  let existingMetadata
  try {
    existingMetadata = (await mgmtFetch(token, `/organizations/name/${encodeURIComponent(orgName)}`)).metadata
  } catch {
    existingMetadata = undefined
  }
  Object.assign(metadata, buildSecurityMetadata(args, existingMetadata))

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
