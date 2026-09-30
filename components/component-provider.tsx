"use client"

import type { ReactNode } from "react"
import { Auth0ComponentProvider } from "@auth0/universal-components-react/rwa"

const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN || ""

// Next.js/RWA mode, baseUrl per Auth0's own confirmed-working
// examples/next-rwa reference app (auth0/auth0-ui-components) — the
// component library talks to the My Account/My Organization APIs through
// @auth0/nextjs-auth0's own built-in route handlers under this base, not a
// custom route this app has to write.
export function PortalComponentProvider({ children }: { children: ReactNode }) {
  return (
    <Auth0ComponentProvider domain={domain} mode="proxy" proxyConfig={{ baseUrl: "/" }} themeSettings={{ theme: "default", mode: "light" }}>
      {children}
    </Auth0ComponentProvider>
  )
}
