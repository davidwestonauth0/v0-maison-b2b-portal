import "server-only"
import { OpenFgaClient, CredentialsMethod } from "@openfga/sdk"

// Authorization model this store is expected to have (see
// scripts/provision-partner-org.mjs for the exact `fga model write` this
// mirrors). One store serves every partner organization — org/product-line
// identity is just the orgSlug string callers pass in, so onboarding a new
// partner needs no changes here.
//
  // type user
  // type organization
  //   relations
  //     define member: [user]
  //     define admin: [user]
  // type product_line
  //   relations
  //     define parent_org: [organization]
  //     define viewer: [user] or admin from parent_org
  //     define manager: [user] or admin from parent_org
//
// "manager" on a product_line can edit its stock; "viewer" is read-only.
// An org "admin" inherits manager+viewer on every product_line under that
// org via the `or admin from parent_org` clause, so org-wide admins don't
// need a per-line tuple — only admins scoped to specific lines do.

const FGA_API_URL = process.env.FGA_API_URL || ""
const FGA_STORE_ID = process.env.FGA_STORE_ID || ""
const FGA_MODEL_ID = process.env.FGA_MODEL_ID || undefined
const FGA_API_TOKEN_ISSUER = process.env.FGA_API_TOKEN_ISSUER || ""
const FGA_API_AUDIENCE = process.env.FGA_API_AUDIENCE || ""
const FGA_CLIENT_ID = process.env.FGA_CLIENT_ID || ""
const FGA_CLIENT_SECRET = process.env.FGA_CLIENT_SECRET || ""

export const isFgaConfigured = Boolean(FGA_API_URL && FGA_STORE_ID)

let client: OpenFgaClient | null = null

function getClient(): OpenFgaClient {
  if (!isFgaConfigured) {
    throw new Error(
      "FGA is not configured. Set FGA_API_URL and FGA_STORE_ID (and, for a " +
        "hosted FGA store, FGA_API_TOKEN_ISSUER/FGA_API_AUDIENCE/FGA_CLIENT_ID/" +
        "FGA_CLIENT_SECRET).",
    )
  }
  if (client) return client
  client = new OpenFgaClient({
    apiUrl: FGA_API_URL,
    storeId: FGA_STORE_ID,
    authorizationModelId: FGA_MODEL_ID,
    ...(FGA_CLIENT_ID && FGA_CLIENT_SECRET
      ? {
          credentials: {
            method: CredentialsMethod.ClientCredentials,
            config: {
              apiTokenIssuer: FGA_API_TOKEN_ISSUER,
              apiAudience: FGA_API_AUDIENCE,
              clientId: FGA_CLIENT_ID,
              clientSecret: FGA_CLIENT_SECRET,
            },
          },
        }
      : {}),
  })
  return client
}

export type ProductLineRelation = "viewer" | "manager"

function productLineObject(orgSlug: string, productLine: string): string {
  // FGA object ids can't contain ":" or whitespace, so use "/" between slug
  // and line and percent-encode the line name.
  return `product_line:${orgSlug}/${encodeURIComponent(productLine)}`
}

export async function isOrganizationAdmin(userId: string, orgSlug: string): Promise<boolean> {
  const { allowed } = await getClient().check({
    user: `user:${userId}`,
    relation: "admin",
    object: `organization:${orgSlug}`,
  })
  return Boolean(allowed)
}

/**
 * Single-relation check — is this user a viewer/manager of this specific
 * product line (directly, or via org-admin inheritance)?
 */
export async function checkProductLineAccess(
  userId: string,
  orgSlug: string,
  productLine: string,
  relation: ProductLineRelation,
): Promise<boolean> {
  const { allowed } = await getClient().check({
    user: `user:${userId}`,
    relation,
    object: productLineObject(orgSlug, productLine),
  })
  return Boolean(allowed)
}

/**
 * All product_line objects (across the whole store) this user has at least
 * `relation` on — used to render the stock page filtered down to only the
 * lines a given partner admin may see at all.
 */
export async function listAccessibleProductLines(
  userId: string,
  relation: ProductLineRelation,
): Promise<string[]> {
  const { objects } = await getClient().listObjects({
    user: `user:${userId}`,
    relation,
    type: "product_line",
  })
  return objects.map((object) => object.replace("product_line:", ""))
}

export async function writeProductLineGrant(
  userId: string,
  orgSlug: string,
  productLine: string,
  relation: ProductLineRelation,
): Promise<void> {
  await getClient().write({
    writes: [
      {
        user: `user:${userId}`,
        relation,
        object: productLineObject(orgSlug, productLine),
      },
    ],
  })
}

export async function deleteProductLineGrant(
  userId: string,
  orgSlug: string,
  productLine: string,
  relation: ProductLineRelation,
): Promise<void> {
  await getClient().write({
    deletes: [
      {
        user: `user:${userId}`,
        relation,
        object: productLineObject(orgSlug, productLine),
      },
    ],
  })
}

/**
 * Org-roster tuple lifecycle — normally written/removed by the Event
 * Stream-bound Action (auth0-actions/organization-member-fga-tuple-sync.js)
 * in response to organization.member.added/deleted, not called directly by
 * this app. Exported for the provisioning script and for tests.
 */
export async function writeOrganizationMember(userId: string, orgSlug: string): Promise<void> {
  await getClient().write({
    writes: [{ user: `user:${userId}`, relation: "member", object: `organization:${orgSlug}` }],
  })
}

export async function deleteOrganizationMember(userId: string, orgSlug: string): Promise<void> {
  await getClient().write({
    deletes: [{ user: `user:${userId}`, relation: "member", object: `organization:${orgSlug}` }],
  })
}

export async function writeOrganizationAdmin(userId: string, orgSlug: string): Promise<void> {
  await getClient().write({
    writes: [{ user: `user:${userId}`, relation: "admin", object: `organization:${orgSlug}` }],
  })
}
