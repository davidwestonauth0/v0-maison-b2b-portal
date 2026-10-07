"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/stock", label: "Stock", adminOnly: false },
  { href: "/team", label: "Team", adminOnly: true },
  { href: "/security", label: "Security & federation", adminOnly: true },
]

export function PortalNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  return (
    <nav className="flex gap-6 -mb-px">
      {TABS.filter((tab) => isAdmin || !tab.adminOnly).map((tab) => {
        const active = pathname?.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "py-3 text-sm border-b-2 transition-colors",
              active
                ? "border-[var(--brand-primary,currentColor)] text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
