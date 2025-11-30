'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import { createClient } from '@/lib/supabase/client'
import type { Supplier } from '@/lib/types/database'

interface EditingSupplier {
  id?: string
  supplier_code: string
  supplier_name: string
  contact_name: string
  contact_phone: string
  contact_email: string
  address: string
  payment_terms_days: number
  is_active: boolean
  isNew?: boolean
}

export default function SuppliersPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [editingSupplier, setEditingSupplier] = useState<EditingSupplier | null>(null)

  useEffect(() => {
    loadSuppliers()
  }, [])

  const loadSuppliers = async () => {
    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('supplier_code')

    if (error) {
      setMessage('加载失败')
    } else {
      setSuppliers(data || [])
    }

    setLoading(false)
  }

  const startEdit = (supplier: Supplier) => {
    setEditingSupplier({
      id: supplier.id,
      supplier_code: supplier.supplier_code,
      supplier_name: supplier.supplier_name,
      contact_name: supplier.contact_name || '',
      contact_phone: supplier.contact_phone || '',
      contact_email: supplier.contact_email || '',
      address: supplier.address || '',
      payment_terms_days: supplier.payment_terms_days || 60,
      is_active: supplier.is_active,
    })
  }

  const startNew = () => {
    setEditingSupplier({
      supplier_code: '',
      supplier_name: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      address: '',
      payment_terms_days: 60,
      is_active: true,
      isNew: true,
    })
  }

  const cancelEdit = () => {
    setEditingSupplier(null)
    setMessage('')
  }

  const saveSupplier = async () => {
    if (!editingSupplier) return
    if (!editingSupplier.supplier_code || !editingSupplier.supplier_name) {
      setMessage('供应商编码和名称为必填项')
      return
    }

    setSaving(true)
    setMessage('')

    const supabase = createClient()

    if (editingSupplier.isNew) {
      const { error } = await (supabase.from('suppliers') as any).insert({
        supplier_code: editingSupplier.supplier_code,
        supplier_name: editingSupplier.supplier_name,
        contact_name: editingSupplier.contact_name || null,
        contact_phone: editingSupplier.contact_phone || null,
        contact_email: editingSupplier.contact_email || null,
        address: editingSupplier.address || null,
        payment_terms_days: editingSupplier.payment_terms_days,
        is_active: editingSupplier.is_active,
      })

      if (error) {
        setMessage(`创建失败: ${error.message}`)
      } else {
        setMessage('创建成功')
        setEditingSupplier(null)
        await loadSuppliers()
      }
    } else {
      const { error } = await (supabase
        .from('suppliers') as any)
        .update({
          supplier_code: editingSupplier.supplier_code,
          supplier_name: editingSupplier.supplier_name,
          contact_name: editingSupplier.contact_name || null,
          contact_phone: editingSupplier.contact_phone || null,
          contact_email: editingSupplier.contact_email || null,
          address: editingSupplier.address || null,
          payment_terms_days: editingSupplier.payment_terms_days,
          is_active: editingSupplier.is_active,
        })
        .eq('id', editingSupplier.id!)

      if (error) {
        setMessage(`更新失败: ${error.message}`)
      } else {
        setMessage('更新成功')
        setEditingSupplier(null)
        await loadSuppliers()
      }
    }

    setSaving(false)
  }

  const deleteSupplier = async (id: string, code: string) => {
    if (!confirm(`确定要删除供应商 ${code} 吗？`)) return

    const supabase = createClient()

    const { error } = await supabase.from('suppliers').delete().eq('id', id)

    if (error) {
      setMessage(`删除失败: ${error.message}`)
    } else {
      setMessage('删除成功')
      await loadSuppliers()
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="供应商管理" description="管理供应商信息" />

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
        {editingSupplier && (
          <Card>
            <CardHeader>
              <CardTitle>{editingSupplier.isNew ? '添加供应商' : '编辑供应商'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="supplier_code">供应商编码 *</Label>
                  <Input
                    id="supplier_code"
                    value={editingSupplier.supplier_code}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, supplier_code: e.target.value })
                    }
                    placeholder="例: SUP-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplier_name">供应商名称 *</Label>
                  <Input
                    id="supplier_name"
                    value={editingSupplier.supplier_name}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, supplier_name: e.target.value })
                    }
                    placeholder="例: 某某工厂"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_terms_days">账期 (天)</Label>
                  <Input
                    id="payment_terms_days"
                    type="number"
                    value={editingSupplier.payment_terms_days}
                    onChange={(e) =>
                      setEditingSupplier({
                        ...editingSupplier,
                        payment_terms_days: parseInt(e.target.value) || 60,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_name">联系人</Label>
                  <Input
                    id="contact_name"
                    value={editingSupplier.contact_name}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, contact_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_phone">联系电话</Label>
                  <Input
                    id="contact_phone"
                    value={editingSupplier.contact_phone}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, contact_phone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_email">联系邮箱</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={editingSupplier.contact_email}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, contact_email: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="address">地址</Label>
                <Textarea
                  id="address"
                  value={editingSupplier.address}
                  onChange={(e) =>
                    setEditingSupplier({ ...editingSupplier, address: e.target.value })
                  }
                  placeholder="供应商地址..."
                />
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingSupplier.is_active}
                    onChange={(e) =>
                      setEditingSupplier({ ...editingSupplier, is_active: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">启用</span>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={saveSupplier} disabled={saving}>
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

        {/* Suppliers Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>供应商列表</CardTitle>
            {!editingSupplier && (
              <Button variant="primary" size="sm" onClick={startNew}>
                <Plus className="mr-2 h-4 w-4" />
                添加供应商
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                加载中...
              </div>
            ) : suppliers.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无供应商
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>供应商编码</TableHead>
                    <TableHead>供应商名称</TableHead>
                    <TableHead>联系人</TableHead>
                    <TableHead>联系电话</TableHead>
                    <TableHead className="text-right">账期</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.supplier_code}</TableCell>
                      <TableCell>{supplier.supplier_name}</TableCell>
                      <TableCell>{supplier.contact_name || '-'}</TableCell>
                      <TableCell>{supplier.contact_phone || '-'}</TableCell>
                      <TableCell className="text-right">{supplier.payment_terms_days} 天</TableCell>
                      <TableCell>
                        <Badge variant={supplier.is_active ? 'success' : 'default'}>
                          {supplier.is_active ? '启用' : '停用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(supplier)}
                            disabled={!!editingSupplier}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSupplier(supplier.id, supplier.supplier_code)}
                            disabled={!!editingSupplier}
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
