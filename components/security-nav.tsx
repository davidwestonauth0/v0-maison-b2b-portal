"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/security/idp-management", label: "Enterprise connections" },
  { href: "/security/domains", label: "Domains" },
  { href: "/security/organization", label: "Organization details" },
]

export function SecurityNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-2 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-md px-3 py-1.5 transition-colors",
            pathname?.startsWith(link.href)
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
