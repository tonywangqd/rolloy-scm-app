'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateInventorySnapshot } from '@/lib/actions/inventory'

interface InventoryEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inventory: {
    sku: string
    warehouse_id: string
    warehouse_name: string
    current_qty: number
  }
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

const ADJUSTMENT_REASONS = [
  { value: 'Physical Count', label: 'Physical Count' },
  { value: 'Adjustment', label: 'Adjustment' },
  { value: 'Damage', label: 'Damage' },
  { value: 'Return', label: 'Return' },
  { value: 'Other', label: 'Other' },
] as const

export function InventoryEditModal({
  open,
  onOpenChange,
  inventory,
  onSuccess,
  onError,
}: InventoryEditModalProps) {
  const [newQty, setNewQty] = React.useState<string>(inventory.current_qty.toString())
  const [reason, setReason] = React.useState<string>('')
  const [notes, setNotes] = React.useState<string>('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) {
      setNewQty(inventory.current_qty.toString())
      setReason('')
      setNotes('')
    }
  }, [open, inventory.current_qty])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!reason) {
      onError('Please select an adjustment reason')
      return
    }

    const qty = parseInt(newQty, 10)
    if (isNaN(qty) || qty < 0) {
      onError('Please enter a valid quantity (0 or greater)')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await updateInventorySnapshot(
        inventory.sku,
        inventory.warehouse_id,
        qty
      )

      if (result.success) {
        onSuccess('Inventory updated successfully')
        onOpenChange(false)
      } else {
        onError(result.error || 'Failed to update inventory')
      }
    } catch (error) {
      onError('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Inventory</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* SKU - Read-only */}
            <div className="grid gap-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={inventory.sku}
                disabled
                className="bg-gray-50"
              />
            </div>

            {/* Warehouse - Read-only */}
            <div className="grid gap-2">
              <Label htmlFor="warehouse">Warehouse</Label>
              <Input
                id="warehouse"
                value={inventory.warehouse_name}
                disabled
                className="bg-gray-50"
              />
            </div>

            {/* Current Quantity - Read-only */}
            <div className="grid gap-2">
              <Label htmlFor="current_qty">Current Quantity</Label>
              <Input
                id="current_qty"
                value={inventory.current_qty}
                disabled
                className="bg-gray-50"
              />
            </div>

            {/* New Quantity - Editable */}
            <div className="grid gap-2">
              <Label htmlFor="new_qty">
                New Quantity <span className="text-red-500">*</span>
              </Label>
              <Input
                id="new_qty"
                type="number"
                min="0"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                required
                placeholder="Enter new quantity"
              />
            </div>

            {/* Adjustment Reason - Dropdown */}
            <div className="grid gap-2">
              <Label htmlFor="reason">
                Adjustment Reason <span className="text-red-500">*</span>
              </Label>
              <RadixSelect value={reason} onValueChange={setReason} required>
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RadixSelect>
            </div>

            {/* Notes - Optional */}
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
