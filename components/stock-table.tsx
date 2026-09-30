"use client"

import { useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { updateStockQuantity } from "@/app/stock/actions"

export interface StockRow {
  id: string
  name: string
  sku: string
  productLine: string
  quantity: number
  canManage: boolean
}

function StockRowItem({ row }: { row: StockRow }) {
  const [quantity, setQuantity] = useState(row.quantity)
  const [saved, setSaved] = useState(row.quantity)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const dirty = quantity !== saved

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateStockQuantity(row.id, row.productLine, quantity)
      if (result.ok) {
        setSaved(quantity)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="text-muted-foreground">{row.sku}</TableCell>
      <TableCell>
        <Badge variant="outline">{row.productLine}</Badge>
      </TableCell>
      <TableCell>
        {row.canManage ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-24"
            />
            {dirty && (
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        ) : (
          <span>{row.quantity}</span>
        )}
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </TableCell>
      <TableCell>
        <Badge variant={row.canManage ? "default" : "secondary"}>{row.canManage ? "Manager" : "Viewer"}</Badge>
      </TableCell>
    </TableRow>
  )
}

export function StockTable({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No product lines are visible to your account.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>Product line</TableHead>
          <TableHead>Stock</TableHead>
          <TableHead>Access</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <StockRowItem key={row.id} row={row} />
        ))}
      </TableBody>
    </Table>
  )
}
