import { NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"

export async function proxy(request: NextRequest) {
  if (!auth0) return

  // @auth0/universal-components-react (proxy mode) sends the scopes a call
  // needs in an `auth0-scope` header, but @auth0/nextjs-auth0's /my-org and
  // /me proxy handlers read a header named `scope`. Without this bridge the
  // SDK exchanges the refresh token with scope=null, Auth0 returns a token
  // with no my_org scopes, and every My Organization call 403s
  // ("Insufficient Scope").
  const { pathname } = request.nextUrl
  const auth0Scope = request.headers.get("auth0-scope")
  if (auth0Scope && !request.headers.has("scope") && (pathname.startsWith("/my-org/") || pathname.startsWith("/me/"))) {
    const headers = new Headers(request.headers)
    headers.set("scope", auth0Scope)
    return await auth0.middleware(new NextRequest(request, { headers }))
  }

  return await auth0.middleware(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
  ]
}
