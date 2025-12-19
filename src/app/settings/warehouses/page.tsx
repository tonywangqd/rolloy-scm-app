'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import Link from 'next/link'
import type { Warehouse } from '@/lib/types/database'
import {
  getWarehouses,
  createWarehouse as createWarehouseAction,
  updateWarehouse as updateWarehouseAction,
  deleteWarehouse as deleteWarehouseAction,
} from '@/lib/actions/settings'

interface EditingWarehouse {
  id?: string
  warehouse_code: string
  warehouse_name: string
  warehouse_type: 'FBA' | '3PL'
  region: 'East' | 'Central' | 'West'
  is_active: boolean
  isNew?: boolean
}

const REGIONS = ['East', 'Central', 'West'] as const
const WAREHOUSE_TYPES = ['FBA', '3PL'] as const

export default function WarehousesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [editingWarehouse, setEditingWarehouse] = useState<EditingWarehouse | null>(null)

  useEffect(() => {
    loadWarehouses()
  }, [])

  const loadWarehouses = async () => {
    setLoading(true)
    const result = await getWarehouses()

    if (!result.success) {
      setMessage(`加载失败: ${result.error}`)
    } else {
      setWarehouses(result.data || [])
    }

    setLoading(false)
  }

  const startEdit = (warehouse: Warehouse) => {
    setEditingWarehouse({
      id: warehouse.id,
      warehouse_code: warehouse.warehouse_code,
      warehouse_name: warehouse.warehouse_name,
      warehouse_type: warehouse.warehouse_type as 'FBA' | '3PL',
      region: warehouse.region as 'East' | 'Central' | 'West',
      is_active: warehouse.is_active,
    })
  }

  const startNew = () => {
    setEditingWarehouse({
      warehouse_code: '',
      warehouse_name: '',
      warehouse_type: 'FBA',
      region: 'East',
      is_active: true,
      isNew: true,
    })
  }

  const cancelEdit = () => {
    setEditingWarehouse(null)
    setMessage('')
  }

  const saveWarehouse = async () => {
    if (!editingWarehouse) return
    if (!editingWarehouse.warehouse_code || !editingWarehouse.warehouse_name) {
      setMessage('仓库编码和仓库名称为必填项')
      return
    }

    setSaving(true)
    setMessage('')

    if (editingWarehouse.isNew) {
      const result = await createWarehouseAction({
        warehouse_code: editingWarehouse.warehouse_code,
        warehouse_name: editingWarehouse.warehouse_name,
        warehouse_type: editingWarehouse.warehouse_type,
        region: editingWarehouse.region,
        is_active: editingWarehouse.is_active,
      })

      if (!result.success) {
        setMessage(`创建失败: ${result.error}`)
      } else {
        setMessage('创建成功')
        setEditingWarehouse(null)
        await loadWarehouses()
      }
    } else {
      const result = await updateWarehouseAction(editingWarehouse.id!, {
        warehouse_code: editingWarehouse.warehouse_code,
        warehouse_name: editingWarehouse.warehouse_name,
        warehouse_type: editingWarehouse.warehouse_type,
        region: editingWarehouse.region,
        is_active: editingWarehouse.is_active,
      })

      if (!result.success) {
        setMessage(`更新失败: ${result.error}`)
      } else {
        setMessage('更新成功')
        setEditingWarehouse(null)
        await loadWarehouses()
      }
    }

    setSaving(false)
  }

  const deleteWarehouse = async (id: string, code: string) => {
    if (!confirm(`确定要删除仓库 ${code} 吗？`)) return

    const result = await deleteWarehouseAction(id)

    if (!result.success) {
      setMessage(`删除失败: ${result.error}`)
    } else {
      setMessage('删除成功')
      await loadWarehouses()
    }
  }

  const getRegionLabel = (region: string) => {
    const labels: Record<string, string> = {
      East: '东部',
      Central: '中部',
      West: '西部',
    }
    return labels[region] || region
  }

  return (
    <div className="flex flex-col">
      <Header title="仓库管理" description="管理海外仓库" />

      <div className="flex-1 space-y-6 p-6">
        {/* Back Button */}
        <Link href="/settings">
          <Button variant="ghost" type="button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回设置
          </Button>
        </Link>

        {message && (
          <div className={`rounded-lg p-4 text-sm ${message.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {message}
          </div>
        )}

        {/* Edit/Add Form */}
        {editingWarehouse && (
          <Card>
            <CardHeader>
              <CardTitle>{editingWarehouse.isNew ? '添加仓库' : '编辑仓库'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="warehouse_code">仓库编码 *</Label>
                  <Input
                    id="warehouse_code"
                    value={editingWarehouse.warehouse_code}
                    onChange={(e) =>
                      setEditingWarehouse({ ...editingWarehouse, warehouse_code: e.target.value })
                    }
                    placeholder="例: FBA-LGB8"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warehouse_name">仓库名称 *</Label>
                  <Input
                    id="warehouse_name"
                    value={editingWarehouse.warehouse_name}
                    onChange={(e) =>
                      setEditingWarehouse({ ...editingWarehouse, warehouse_name: e.target.value })
                    }
                    placeholder="例: LGB8 洛杉矶"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warehouse_type">仓库类型</Label>
                  <Select
                    id="warehouse_type"
                    value={editingWarehouse.warehouse_type}
                    onChange={(e) =>
                      setEditingWarehouse({
                        ...editingWarehouse,
                        warehouse_type: e.target.value as 'FBA' | '3PL',
                      })
                    }
                  >
                    {WAREHOUSE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">区域</Label>
                  <Select
                    id="region"
                    value={editingWarehouse.region}
                    onChange={(e) =>
                      setEditingWarehouse({
                        ...editingWarehouse,
                        region: e.target.value as 'East' | 'Central' | 'West',
                      })
                    }
                  >
                    {REGIONS.map((region) => (
                      <option key={region} value={region}>
                        {getRegionLabel(region)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingWarehouse.is_active}
                    onChange={(e) =>
                      setEditingWarehouse({ ...editingWarehouse, is_active: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">启用</span>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={saveWarehouse} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? '保存中...' : '保存'}
                </Button>
                <Button variant="outline" onClick={cancelEdit}>
                  <X className="mr-2 h-4 w-4" />
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warehouses Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>仓库列表</CardTitle>
            {!editingWarehouse && (
              <Button variant="primary" size="sm" onClick={startNew}>
                <Plus className="mr-2 h-4 w-4" />
                添加仓库
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                加载中...
              </div>
            ) : warehouses.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无仓库
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>仓库编码</TableHead>
                    <TableHead>仓库名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>区域</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((warehouse) => (
                    <TableRow key={warehouse.id}>
                      <TableCell className="font-medium">{warehouse.warehouse_code}</TableCell>
                      <TableCell>{warehouse.warehouse_name}</TableCell>
                      <TableCell>
                        <Badge variant={warehouse.warehouse_type === 'FBA' ? 'default' : 'warning'}>
                          {warehouse.warehouse_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{getRegionLabel(warehouse.region)}</TableCell>
                      <TableCell>
                        <Badge variant={warehouse.is_active ? 'success' : 'default'}>
                          {warehouse.is_active ? '启用' : '停用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(warehouse)}
                            disabled={!!editingWarehouse}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteWarehouse(warehouse.id, warehouse.warehouse_code)}
                            disabled={!!editingWarehouse}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
