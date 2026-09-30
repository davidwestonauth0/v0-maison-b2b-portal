"use client"

import { useEffect, useState, useTransition } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { loadProductLineGrants, type MemberGrantRow, type ProductLineGrantsData } from "@/app/team/grants-actions"
import { grantProductLineAccess, revokeProductLineAccess } from "@/app/team/actions"

type Relation = "viewer" | "manager" | "none"

function GrantCell({ userId, productLine, value }: { userId: string; productLine: string; value: Relation }) {
  const [current, setCurrent] = useState<Relation>(value)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleChange(next: Relation) {
    setError(null)
    startTransition(async () => {
      const result =
        next === "none"
          ? await revokeProductLineAccess(userId, productLine, current === "manager" ? "manager" : "viewer")
          : await grantProductLineAccess(userId, productLine, next)
      if (result.ok) {
        setCurrent(next)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div>
      <Select value={current} onValueChange={(v) => handleChange(v as Relation)} disabled={isPending}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No access</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
          <SelectItem value="manager">Manager</SelectItem>
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}

function GrantsTable({ data }: { data: ProductLineGrantsData }) {
  if (data.members.length === 0) {
    return <p className="text-sm text-muted-foreground">No organization members found.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          {data.productLines.map((line) => (
            <TableHead key={line}>{line}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.members.map((member: MemberGrantRow) => (
          <TableRow key={member.userId}>
            <TableCell className="font-medium">{member.email}</TableCell>
            {data.productLines.map((line) => (
              <TableCell key={line}>
                <GrantCell userId={member.userId} productLine={line} value={member.grants[line] ?? "none"} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ProductLineGrants() {
  const [data, setData] = useState<ProductLineGrantsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadProductLineGrants()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load grants"))
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  return <GrantsTable data={data} />
}
