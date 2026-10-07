import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { isPortalAdmin } from "@/lib/portal-role"

// Team management is for org admins only — the nav hides it, this enforces it.
export default async function TeamLayout({ children }: { children: ReactNode }) {
  if (!(await isPortalAdmin())) redirect("/stock")
  return children
}
