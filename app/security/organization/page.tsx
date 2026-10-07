"use client"

import { OrganizationDetailsEdit } from "@auth0/universal-components-react"

// Organization profile (display name, logo, colors) — Auth0's own
// Organizations self-service component, backed by the My Organization API
// (read/update:my_org:details). The portal header reads the same branding
// in app/layout.tsx, so saved changes show up on the next page load.
export default function OrganizationDetailsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Organization details</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Your organization&apos;s name and branding, shown on the sign-in page and across the portal.
      </p>
      <OrganizationDetailsEdit hideHeader />
    </div>
  )
}
