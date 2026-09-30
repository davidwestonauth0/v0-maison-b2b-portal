"use client"

import type { OrganizationMemberDetailTab } from "@auth0/universal-components-react"
import { OrganizationMemberDetail } from "@auth0/universal-components-react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useCallback } from "react"

export default function MemberDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const userId = decodeURIComponent(params.user_id as string)
  const tab = searchParams.get("tab") as OrganizationMemberDetailTab | null

  const handleBack = useCallback(() => {
    router.push("/team")
  }, [router])

  return (
    <div>
      <OrganizationMemberDetail userId={userId} initialTab={tab ?? undefined} onBack={handleBack} />
    </div>
  )
}
