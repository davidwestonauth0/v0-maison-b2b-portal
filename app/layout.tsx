import type { Metadata } from "next"
import type { CSSProperties, ReactNode } from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth0, isAuth0Configured } from "@/lib/auth0"
import { PortalNav } from "@/components/nav"
import { PortalComponentProvider } from "@/components/component-provider"
import { getPartnerContext, PartnerContextError } from "@/lib/partner-context"
import { isPortalAdmin } from "@/lib/portal-role"
import "./globals.css"

export const metadata: Metadata = {
  title: "Maison Partner Portal",
  description: "Delegated stock management for Maison's B2B partners' own employees, built on Auth0 Organizations and FGA.",
}

// Font from the tenant's Universal Login theme (Branding > Universal Login > Fonts).
const THEME_FONT_URL =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Geist:wght@300;400;500;600;700&display=swap"

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
            <form action="/auth/logout" method="GET" className="mt-4">
              <button type="submit" className="text-sm text-muted-foreground underline hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </body>
      </html>
    )
  }

  const isAdmin = await isPortalAdmin()
  // Organization branding (Auth0 Organization > Branding) — logo and colors.
  const branding = context.organization.branding
  const brandStyle = {
    ...(branding?.colors?.primary ? { "--primary": branding.colors.primary, "--brand-primary": branding.colors.primary } : {}),
    ...(branding?.colors?.page_background ? { "--brand-background": branding.colors.page_background } : {}),
  } as CSSProperties
  const partnerName = context.organization.display_name ?? context.organization.name

  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href={THEME_FONT_URL} />
        {branding?.logo_url ? <link rel="icon" href={branding.logo_url} /> : null}
      </head>
      <body className="font-sans antialiased" style={brandStyle}>
        <PortalComponentProvider>
          <div className="min-h-screen bg-muted/30" style={branding?.colors?.page_background ? { backgroundColor: "var(--brand-background)" } : undefined}>
            <header className="border-b border-border bg-background">
              <div className="container mx-auto px-4 py-4 flex items-center justify-between max-w-5xl">
                <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
                  {branding?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={branding.logo_url} alt={partnerName} className="h-8 w-auto" />
                  ) : null}
                  <span style={branding?.colors?.primary ? { color: "var(--brand-primary)" } : undefined}>
                    {partnerName} Partner Portal
                  </span>
                </Link>
                <form action="/auth/logout" method="GET">
                  <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                    Sign out
                  </button>
                </form>
              </div>
              <div className="container mx-auto px-4 max-w-5xl">
                <PortalNav isAdmin={isAdmin} />
              </div>
            </header>
            <main className="container mx-auto px-4 py-8 max-w-5xl">{children}</main>
          </div>
        </PortalComponentProvider>
      </body>
    </html>
  )
}
