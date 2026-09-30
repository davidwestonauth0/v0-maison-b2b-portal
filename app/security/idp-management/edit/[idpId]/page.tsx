"use client"

import { SsoProviderEdit } from "@auth0/universal-components-react"
import { useRouter, useParams } from "next/navigation"
import { useCallback, useMemo } from "react"

export default function SsoProviderEditPage() {
  const router = useRouter()
  const params = useParams()
  const idpId = params.idpId as string

  const handleBackToList = useCallback(() => {
    router.push("/security/idp-management")
  }, [router])

  const updateAction = useMemo(() => ({ onAfter: handleBackToList }), [handleBackToList])
  const deleteAction = useMemo(() => ({ onAfter: handleBackToList }), [handleBackToList])
  const deleteFromOrganizationAction = useMemo(() => ({ onAfter: handleBackToList }), [handleBackToList])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Edit identity provider</h1>
      <SsoProviderEdit
        providerId={idpId}
        sso={{ updateAction, deleteAction, deleteFromOrganizationAction }}
        backButton={{ onClick: handleBackToList }}
      />
    </div>
  )
}
