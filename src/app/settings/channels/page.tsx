'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { createClient } from '@/lib/supabase/client'
import type { Channel } from '@/lib/types/database'

interface EditingChannel {
  channel_code: string
  channel_name: string
  is_active: boolean
  isNew?: boolean
}

export default function ChannelsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])
  const [editingChannel, setEditingChannel] = useState<EditingChannel | null>(null)

  useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .order('channel_code')

    if (error) {
      setMessage('加载失败')
    } else {
      setChannels(data || [])
    }

    setLoading(false)
  }

  const startEdit = (channel: Channel) => {
    setEditingChannel({
      channel_code: channel.channel_code,
      channel_name: channel.channel_name,
      is_active: channel.is_active,
    })
  }

  const startNew = () => {
    setEditingChannel({
      channel_code: '',
      channel_name: '',
      is_active: true,
      isNew: true,
    })
  }

  const cancelEdit = () => {
    setEditingChannel(null)
    setMessage('')
  }

  const saveChannel = async () => {
    if (!editingChannel) return
    if (!editingChannel.channel_code || !editingChannel.channel_name) {
      setMessage('渠道编码和渠道名称为必填项')
      return
    }

    setSaving(true)
    setMessage('')

    const supabase = createClient()

    if (editingChannel.isNew) {
      const { error } = await (supabase.from('channels') as any).insert({
        channel_code: editingChannel.channel_code,
        channel_name: editingChannel.channel_name,
        is_active: editingChannel.is_active,
      })

      if (error) {
        setMessage(`创建失败: ${error.message}`)
      } else {
        setMessage('创建成功')
        setEditingChannel(null)
        await loadChannels()
      }
    } else {
      const { error } = await (supabase
        .from('channels') as any)
        .update({
          channel_name: editingChannel.channel_name,
          is_active: editingChannel.is_active,
        })
        .eq('channel_code', editingChannel.channel_code)

      if (error) {
        setMessage(`更新失败: ${error.message}`)
      } else {
        setMessage('更新成功')
        setEditingChannel(null)
        await loadChannels()
      }
    }

    setSaving(false)
  }

  const deleteChannel = async (channelCode: string) => {
    if (!confirm(`确定要删除渠道 ${channelCode} 吗？`)) return

    const supabase = createClient()

    const { error } = await supabase.from('channels').delete().eq('channel_code', channelCode)

    if (error) {
      setMessage(`删除失败: ${error.message}`)
    } else {
      setMessage('删除成功')
      await loadChannels()
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="渠道管理" description="管理销售渠道" />

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
        {editingChannel && (
          <Card>
            <CardHeader>
              <CardTitle>{editingChannel.isNew ? '添加渠道' : '编辑渠道'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="channel_code">渠道编码 *</Label>
                  <Input
                    id="channel_code"
                    value={editingChannel.channel_code}
                    onChange={(e) =>
                      setEditingChannel({ ...editingChannel, channel_code: e.target.value })
                    }
                    disabled={!editingChannel.isNew}
                    placeholder="例: Amazon"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel_name">渠道名称 *</Label>
                  <Input
                    id="channel_name"
                    value={editingChannel.channel_name}
                    onChange={(e) =>
                      setEditingChannel({ ...editingChannel, channel_name: e.target.value })
                    }
                    placeholder="例: 亚马逊"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingChannel.is_active}
                    onChange={(e) =>
                      setEditingChannel({ ...editingChannel, is_active: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">启用</span>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={saveChannel} disabled={saving}>
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

        {/* Channels Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>渠道列表</CardTitle>
            {!editingChannel && (
              <Button variant="primary" size="sm" onClick={startNew}>
                <Plus className="mr-2 h-4 w-4" />
                添加渠道
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                加载中...
              </div>
            ) : channels.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-gray-500">
                暂无渠道
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>渠道编码</TableHead>
                    <TableHead>渠道名称</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.map((channel) => (
                    <TableRow key={channel.channel_code}>
                      <TableCell className="font-medium">{channel.channel_code}</TableCell>
                      <TableCell>{channel.channel_name}</TableCell>
                      <TableCell>
                        <Badge variant={channel.is_active ? 'success' : 'default'}>
                          {channel.is_active ? '启用' : '停用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(channel)}
                            disabled={!!editingChannel}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteChannel(channel.channel_code)}
                            disabled={!!editingChannel}
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
