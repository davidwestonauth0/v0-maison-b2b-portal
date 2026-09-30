import type { Metadata } from "next"
import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth0, isAuth0Configured } from "@/lib/auth0"
import { PortalNav } from "@/components/nav"
import { PortalComponentProvider } from "@/components/component-provider"
import { getPartnerContext, PartnerContextError } from "@/lib/partner-context"
import "./globals.css"

export const metadata: Metadata = {
  title: "Maison Partner Portal",
  description: "Delegated stock management for Maison's B2B partners' own employees, built on Auth0 Organizations and FGA.",
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  if (!isAuth0Configured || !auth0) {
    return (
      <html lang="en">
        <body>
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <h1 className="text-2xl font-semibold mb-2">Partner portal unavailable</h1>
            <p className="text-sm text-muted-foreground">Auth0 is not configured.</p>
          </div>
        </body>
      </html>
    )
  }

  let session
  try {
    session = await auth0.getSession()
  } catch {
    session = null
  }
  if (!session?.user) {
    // No org= param — this portal has no single partner to route to. A
    // partner employee should always be arriving via a link/bookmark that
    // already carries their organization's own login URL, e.g.
    // /auth/login?organization=<their org_id>&returnTo=/
    redirect(`/auth/login?returnTo=${encodeURIComponent("/")}`)
  }

  let context
  try {
    context = await getPartnerContext()
  } catch (error) {
    const message = error instanceof PartnerContextError ? error.message : "Unable to load your organization"
    console.log("[layout] partner context resolution failed:", message)
    return (
      <html lang="en">
        <body>
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <h1 className="text-2xl font-semibold mb-2">Partner portal unavailable</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <PortalComponentProvider>
          <div className="min-h-screen bg-muted/30">
            <header className="border-b border-border bg-background">
              <div className="container mx-auto px-4 py-4 flex items-center justify-between max-w-5xl">
                <Link href="/" className="text-lg font-semibold">
                  {context.organization.display_name ?? context.organization.name} Partner Portal
                </Link>
                <form action="/auth/logout" method="GET">
                  <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                    Sign out
                  </button>
                </form>
              </div>
              <div className="container mx-auto px-4 max-w-5xl">
                <PortalNav />
              </div>
            </header>
            <main className="container mx-auto px-4 py-8 max-w-5xl">{children}</main>
          </div>
        </PortalComponentProvider>
      </body>
    </html>
  )
}
