"use client"

import { OrganizationMemberManagement } from "@auth0/universal-components-react"
import { useRouter } from "next/navigation"
import { useCallback, useMemo } from "react"

export function MemberManagementSection() {
  const router = useRouter()

  const handleViewMemberDetails = useCallback(
    ({ userId, tab }: { userId: string; tab?: string }) => {
      router.push(`/team/${encodeURIComponent(userId)}${tab ? `?tab=${tab}` : ""}`)
    },
    [router],
  )

  const viewMemberDetailsAction = useMemo(() => ({ onAfter: handleViewMemberDetails }), [handleViewMemberDetails])

  return <OrganizationMemberManagement viewMemberDetailsAction={viewMemberDetailsAction} />
}
