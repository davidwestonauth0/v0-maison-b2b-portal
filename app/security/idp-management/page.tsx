"use client"

import { SsoProviderTable, type IdpKnownResponse } from "@auth0/universal-components-react"
import { useRouter } from "next/navigation"
import { useCallback, useMemo } from "react"

// Enterprise federation, self-service: this list/table is Auth0's own
// Organizations Universal Login self-service management component, backed
// by the My Organization API — Veridian's own org admins configure their
// enterprise IdP here without this app building any SAML/OIDC UI itself.
export default function IdpManagementPage() {
  const router = useRouter()

  const handleCreate = useCallback(() => {
    router.push("/security/idp-management/create")
  }, [router])

  const handleEdit = useCallback(
    (provider: IdpKnownResponse) => {
      router.push(`/security/idp-management/edit/${provider.id}`)
    },
    [router],
  )

  const createAction = useMemo(() => ({ onAfter: handleCreate }), [handleCreate])
  const editAction = useMemo(() => ({ onAfter: handleEdit }), [handleEdit])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Enterprise connections</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configure the SAML/OIDC identity provider your employees federate through when signing in to the partner
        portal.
      </p>
      <SsoProviderTable createAction={createAction} editAction={editAction} />
    </div>
  )
}
