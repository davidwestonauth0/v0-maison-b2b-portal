"use client"

import { SsoProviderCreate } from "@auth0/universal-components-react"
import { useRouter } from "next/navigation"
import { useCallback, useMemo } from "react"

export default function SsoProviderCreatePage() {
  const router = useRouter()

  const handleCreate = useCallback(() => {
    router.push("/security/idp-management")
  }, [router])

  const createAction = useMemo(() => ({ onAfter: handleCreate }), [handleCreate])

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Add an identity provider</h1>
      <SsoProviderCreate createAction={createAction} />
    </div>
  )
}
