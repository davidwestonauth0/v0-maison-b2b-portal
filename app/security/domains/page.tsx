"use client"

import { DomainTable } from "@auth0/universal-components-react"
import { useRouter } from "next/navigation"
import { useCallback } from "react"

// Verified domains for the organization (used for home realm discovery /
// enterprise federation) — Auth0's own Organizations self-service component,
// backed by the My Organization API (domains + identity_providers_domains).
export default function DomainsPage() {
  const router = useRouter()
  const openProvider = useCallback(
    (provider: { id?: string }) => {
      if (provider.id) router.push(`/security/idp-management/edit/${provider.id}`)
    },
    [router],
  )
  const createProvider = useCallback(() => router.push("/security/idp-management/create"), [router])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Domains</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Verify the email domains your employees sign in with, and link them to your identity providers.
      </p>
      <DomainTable hideHeader onOpenProvider={openProvider} onCreateProvider={createProvider} />
    </div>
  )
}
