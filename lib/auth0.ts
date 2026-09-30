import { Auth0Client } from "@auth0/nextjs-auth0/server"
import { NextResponse } from "next/server"
import { authSessionStore } from "@/lib/auth0-session-store"

export function getDomain(): string {
  const issuerUrl = process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH0_DOMAIN || ""
  return issuerUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

// The Management API isn't served on a custom domain — same reasoning as
// Maison's own lib/auth0.ts. Falls back to getDomain() if no custom domain
// is configured, where it's already canonical.
export function getCanonicalDomain(): string {
  const canonical = process.env.AUTH0_CANONICAL_DOMAIN || ""
  return canonical ? canonical.replace(/^https?:\/\//, "").replace(/\/+$/, "") : getDomain()
}

const domain = getDomain()
const clientId = process.env.AUTH0_CLIENT_ID || ""
const clientSecret = process.env.AUTH0_CLIENT_SECRET || ""
const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000"
const secret = process.env.AUTH0_SECRET || "a-long-secret-value-for-development-only"

export const isAuth0Configured = Boolean(domain && clientId && clientSecret)

// Deliberately no `routes` override here — this app owns /auth/* at the
// SDK's own default paths. @auth0/universal-components-react's proxy-mode
// fetchers (the My Organization API client, the permission client used by
// every Auth0ComponentProvider) hit hardcoded absolute paths — /my-org/*,
// /me/*, /auth/profile — that the SDK's own AuthClient.handler() matches
// literally, NOT relative to a configured `routes` prefix (confirmed by
// reading @auth0/nextjs-auth0's own auth-client.js and
// auth0-ui-components' permission-api-service.ts directly). Remapping
// routes here would silently break every embedded component — this is
// exactly the problem that caused this app to be split out of the Maison
// storefront repo, which already owns /auth/* for its own, unrelated
// Auth0Client.
export const auth0 = isAuth0Configured
  ? new Auth0Client({
      domain,
      clientId,
      clientSecret,
      appBaseUrl,
      secret,
      enableTelemetry: false,
      sessionStore: authSessionStore,
      authorizationParameters: {
        scope: "openid profile email offline_access",
      },
      async onCallback(error, ctx) {
        const base = ctx.appBaseUrl || appBaseUrl
        if (error) {
          const params = new URLSearchParams()
          if (error.code) params.set("error", error.code)
          if (error.message) params.set("error_description", error.message)
          return NextResponse.redirect(new URL(`/auth/error?${params}`, base))
        }
        return NextResponse.redirect(new URL(ctx.returnTo || "/", base))
      },
    })
  : null
