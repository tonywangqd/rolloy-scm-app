'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Edit } from 'lucide-react'
import { formatNumber, getWarehouseTypeVariant } from '@/lib/utils'
import { InventoryEditModal } from './inventory-edit-modal'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/lib/hooks/use-toast'

interface InventoryByWarehouseProps {
  warehouseInventory: {
    warehouse_id: string
    warehouse_code: string
    warehouse_name: string
    warehouse_type: string
    total_qty: number
    items: { sku: string; product_name: string; qty: number }[]
  }[]
}

export function InventoryByWarehouse({ warehouseInventory }: InventoryByWarehouseProps) {
  const [editingInventory, setEditingInventory] = React.useState<{
    sku: string
    warehouse_id: string
    warehouse_name: string
    current_qty: number
  } | null>(null)
  const { toasts, showToast, dismissToast } = useToast()

  const handleEditClick = (
    sku: string,
    warehouseId: string,
    warehouseName: string,
    currentQty: number
  ) => {
    setEditingInventory({
      sku,
      warehouse_id: warehouseId,
      warehouse_name: warehouseName,
      current_qty: currentQty,
    })
  }

  const handleSuccess = (message: string) => {
    showToast(message, 'success')
    // Refresh page data
    window.location.reload()
  }

  const handleError = (message: string) => {
    showToast(message, 'error')
  }

  return (
    <>
      {warehouseInventory.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-gray-500">
          No inventory data available
        </div>
      ) : (
        <div className="space-y-4">
          {warehouseInventory.map((warehouse) => (
            <div key={warehouse.warehouse_id} className="rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={getWarehouseTypeVariant(warehouse.warehouse_type)}>
                    {warehouse.warehouse_type}
                  </Badge>
                  <span className="font-semibold">{warehouse.warehouse_code}</span>
                  <span className="text-gray-500">- {warehouse.warehouse_name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-500">Total Stock: </span>
                  <span className="font-semibold">{formatNumber(warehouse.total_qty)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {warehouse.items.map((item) => (
                  <div
                    key={item.sku}
                    className="flex items-center gap-2 rounded bg-gray-50 px-3 py-1 text-sm"
                  >
                    <span className="font-medium">{item.sku}</span>
                    <span className="text-gray-400">|</span>
                    <span>{formatNumber(item.qty)}</span>
                    <button
                      onClick={() =>
                        handleEditClick(
                          item.sku,
                          warehouse.warehouse_id,
                          `${warehouse.warehouse_code} - ${warehouse.warehouse_name}`,
                          item.qty
                        )
                      }
                      className="ml-1 rounded p-1 hover:bg-gray-200 transition-colors"
                      title="Edit inventory"
                    >
                      <Edit className="h-3 w-3 text-gray-600" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingInventory && (
        <InventoryEditModal
          open={!!editingInventory}
          onOpenChange={(open) => !open && setEditingInventory(null)}
          inventory={editingInventory}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
