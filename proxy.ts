import { NextRequest } from "next/server"
import { auth0 } from "@/lib/auth0"

const debugMyOrg = process.env.NODE_ENV !== "production"

export async function proxy(request: NextRequest) {
  if (!auth0) return

  // @auth0/universal-components-react (proxy mode) sends the scopes a call
  // needs in an `auth0-scope` header, but @auth0/nextjs-auth0's /my-org and
  // /me proxy handlers read a header named `scope`. Without this bridge the
  // SDK exchanges the refresh token with scope=null, Auth0 returns a token
  // with no my_org scopes, and every My Organization call 403s
  // ("Insufficient Scope").
  const { pathname, search } = request.nextUrl
  const isApiProxy = pathname.startsWith("/my-org/") || pathname.startsWith("/me/")
  const auth0Scope = request.headers.get("auth0-scope")

  let forwarded = request
  if (isApiProxy && auth0Scope && !request.headers.has("scope")) {
    const headers = new Headers(request.headers)
    headers.set("scope", auth0Scope)
    forwarded = new NextRequest(request, { headers })
  }

  const response = await auth0.middleware(forwarded)

  if (debugMyOrg && isApiProxy && response) {
    const line = `[my-org] ${request.method} ${pathname}${search.slice(0, 80)} scope="${auth0Scope ?? ""}" -> ${response.status}`
    if (response.status >= 400) {
      const body = await response.clone().text().catch(() => "")
      console.log(line, body.slice(0, 400))
    } else {
      console.log(line)
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
  ]
}
