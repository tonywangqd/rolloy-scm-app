'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { updateDelivery, deleteDelivery } from '@/lib/actions/procurement'
import { AlertCircle, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { DeliveryEditContext, PaymentStatus } from '@/lib/types/database'

interface DeliveryEditFormProps {
  context: DeliveryEditContext
}

export function DeliveryEditForm({ context }: DeliveryEditFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [formData, setFormData] = useState({
    delivered_qty: context.delivery.delivered_qty,
    actual_delivery_date: context.delivery.actual_delivery_date || '',
    unit_cost_usd: context.delivery.unit_cost_usd,
    payment_status: context.delivery.payment_status,
    remarks: context.delivery.remarks || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
    // Clear error when user edits
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (formData.delivered_qty <= 0) {
      newErrors.delivered_qty = '交付数量必须大于0'
    }

    if (formData.delivered_qty > context.max_allowed_qty) {
      newErrors.delivered_qty = `交付数量不能超过 ${context.max_allowed_qty} (订单量 ${context.po_item.ordered_qty} - 其他交付 ${context.other_deliveries_qty})`
    }

    if (!formData.actual_delivery_date) {
      newErrors.actual_delivery_date = '交付日期为必填项'
    } else {
      const deliveryDate = new Date(formData.actual_delivery_date)
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      if (deliveryDate > today) {
        newErrors.actual_delivery_date = '交付日期不能是未来日期'
      }
    }

    if (formData.unit_cost_usd <= 0 || formData.unit_cost_usd > 10000) {
      newErrors.unit_cost_usd = '单价必须在 $0.01 - $10,000 之间'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('请修正表单错误')
      return
    }

    setLoading(true)

    const result = await updateDelivery(context.delivery.id, {
      delivered_qty: formData.delivered_qty,
      actual_delivery_date: formData.actual_delivery_date,
      unit_cost_usd: formData.unit_cost_usd,
      payment_status: formData.payment_status as PaymentStatus,
      remarks: formData.remarks || null,
    })

    if (result.success) {
      toast.success('交付记录已更新 Delivery record updated')
      router.push(`/procurement/${context.po.id}`)
    } else {
      toast.error(result.error || '更新失败')
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (hasChanges) {
      const confirmed = window.confirm('确定放弃更改吗？')
      if (!confirmed) return
    }
    router.push(`/procurement/${context.po.id}`)
  }

  const handleDeleteConfirm = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('请输入 DELETE 确认删除')
      return
    }

    setLoading(true)
    const result = await deleteDelivery(context.delivery.id)

    if (result.success) {
      toast.success('交付记录已删除 Delivery deleted')
      router.push(`/procurement/${context.po.id}`)
    } else {
      toast.error(result.error || '删除失败 Delete failed')
      setLoading(false)
      setDeleteDialogOpen(false)
    }
  }

  // Check if deletion is blocked
  const isDeletionBlocked = context.delivery.payment_status !== 'Pending'
  const deletionBlockReason =
    context.delivery.payment_status === 'Paid'
      ? '已支付的交付记录无法删除 Paid deliveries cannot be deleted'
      : context.delivery.payment_status === 'Scheduled'
      ? '已排期付款的交付记录无法删除 Scheduled deliveries cannot be deleted'
      : null

  // Calculate cost variance warning
  const originalCost = context.delivery.unit_cost_usd
  const costVariance = ((formData.unit_cost_usd - originalCost) / originalCost) * 100
  const showCostWarning = Math.abs(costVariance) > 20

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Read-Only Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>基本信息 Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-gray-500">Delivery Number</Label>
            <p className="font-medium">{context.delivery.delivery_number}</p>
          </div>
          <div>
            <Label className="text-gray-500">PO Number</Label>
            <p className="font-medium">
              <a
                href={`/procurement/${context.po.id}`}
                className="text-blue-600 hover:underline"
              >
                {context.po.po_number}
              </a>
            </p>
          </div>
          <div>
            <Label className="text-gray-500">SKU</Label>
            <p className="font-medium">{context.delivery.sku}</p>
          </div>
          <div>
            <Label className="text-gray-500">Channel</Label>
            <p className="font-medium">{context.delivery.channel_code || 'N/A'}</p>
          </div>
          <div className="col-span-2 border-t pt-4">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <Label className="text-gray-500">PO Ordered Qty</Label>
                <p className="text-base font-semibold">{context.po_item.ordered_qty}</p>
              </div>
              <div>
                <Label className="text-gray-500">Other Deliveries</Label>
                <p className="text-base font-semibold">{context.other_deliveries_qty}</p>
              </div>
              <div>
                <Label className="text-gray-500">Max Allowed</Label>
                <p className="text-base font-semibold text-green-600">
                  {context.max_allowed_qty}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable Fields Card */}
      <Card>
        <CardHeader>
          <CardTitle>交付信息 Delivery Information (Editable)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Delivered Quantity */}
          <div>
            <Label htmlFor="delivered_qty">
              Delivered Quantity <span className="text-red-500">*</span>
            </Label>
            <NumericInput
              id="delivered_qty"
              value={formData.delivered_qty}
              onChange={(value) => handleChange('delivered_qty', value)}
              min={1}
              max={context.max_allowed_qty}
              className={errors.delivered_qty ? 'border-red-500' : ''}
            />
            {errors.delivered_qty && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {errors.delivered_qty}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Current: {context.delivery.delivered_qty}, Max: {context.max_allowed_qty}
            </p>
          </div>

          {/* Actual Delivery Date */}
          <div>
            <Label htmlFor="actual_delivery_date">
              Actual Delivery Date <span className="text-red-500">*</span>
            </Label>
            <DateInput
              id="actual_delivery_date"
              value={formData.actual_delivery_date}
              onChange={(value) => handleChange('actual_delivery_date', value)}
              className={errors.actual_delivery_date ? 'border-red-500' : ''}
            />
            {errors.actual_delivery_date && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {errors.actual_delivery_date}
              </p>
            )}
          </div>

          {/* Unit Cost USD */}
          <div>
            <Label htmlFor="unit_cost_usd">
              Unit Cost (USD) <span className="text-red-500">*</span>
            </Label>
            <NumericInput
              id="unit_cost_usd"
              value={formData.unit_cost_usd}
              onChange={(value) => handleChange('unit_cost_usd', value)}
              allowDecimal
              decimalPlaces={2}
              className={errors.unit_cost_usd ? 'border-red-500' : ''}
            />
            {errors.unit_cost_usd && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {errors.unit_cost_usd}
              </p>
            )}
            {showCostWarning && (
              <p className="mt-1 flex items-center gap-1 text-xs text-yellow-600">
                <AlertCircle className="h-3 w-3" />
                单价与原始价格差异 {costVariance.toFixed(1)}%，请确认。
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Original: ${originalCost.toFixed(2)}
            </p>
          </div>

          {/* Payment Status */}
          <div>
            <Label htmlFor="payment_status">Payment Status</Label>
            <select
              id="payment_status"
              value={formData.payment_status}
              onChange={(e) => handleChange('payment_status', e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="Pending">Pending (待支付)</option>
              <option value="Scheduled">Scheduled (已排期)</option>
              <option value="Paid">Paid (已支付)</option>
            </select>
          </div>

          {/* Remarks */}
          <div>
            <Label htmlFor="remarks">Remarks (Optional)</Label>
            <Textarea
              id="remarks"
              value={formData.remarks}
              onChange={(e) => handleChange('remarks', e.target.value)}
              placeholder="请说明本次编辑的原因..."
              maxLength={500}
              rows={3}
            />
            <p className="mt-1 text-xs text-gray-500">
              {formData.remarks.length}/500 characters
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
          取消 Cancel
        </Button>

        <div className="flex gap-3">
          {/* Delete Dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="danger"
                disabled={loading || isDeletionBlocked}
                title={deletionBlockReason || undefined}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除 Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  确定要删除此交付记录吗？
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p className="text-gray-700 font-medium">
                    此操作将执行以下操作：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                    <li>从数据库中永久删除交付记录 #{context.delivery.delivery_number}</li>
                    <li>回滚 PO Item 的 delivered_qty，减少 {context.delivery.delivered_qty} 单位</li>
                    <li>创建审计日志记录以便追溯</li>
                  </ul>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mt-3">
                    <p className="text-sm text-yellow-800 font-medium">
                      警告：此操作不可撤销
                    </p>
                  </div>
                  <div className="mt-4">
                    <Label htmlFor="delete-confirm" className="text-sm font-medium text-gray-700">
                      请输入 <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">DELETE</span> 确认删除
                    </Label>
                    <Input
                      id="delete-confirm"
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="输入 DELETE"
                      className="mt-2"
                      autoComplete="off"
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setDeleteConfirmText('')
                  }}
                >
                  取消 Cancel
                </AlertDialogCancel>
                <Button
                  variant="danger"
                  onClick={handleDeleteConfirm}
                  disabled={loading || deleteConfirmText !== 'DELETE'}
                >
                  {loading ? '删除中...' : '确认删除 Confirm Delete'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {isDeletionBlocked && (
            <p className="text-xs text-gray-500 self-center max-w-xs">
              {deletionBlockReason}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {loading ? '保存中...' : '保存 Save'}
          </Button>
        </div>
      </div>
    </form>
  )
}
