'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  RadixSelect,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Plus, Ship, Plane, Truck, Loader2, Trash2 } from 'lucide-react'
import { useToast } from '@/lib/hooks/use-toast'
import { ToastContainer } from '@/components/ui/toast'
import {
  getLogisticsRoutes,
  updateLogisticsRoute,
  createLogisticsRoute,
  deleteLogisticsRoute,
} from '@/lib/actions/constraints'

// Type definitions - matching lib/types/simulation.ts
export type ShippingMode = 'Sea' | 'Air' | 'Express'

export interface LogisticsRoute {
  id: string
  route_code: string
  route_name: string
  origin_country: string
  destination_region: string
  shipping_mode: ShippingMode
  transit_time_weeks: number
  cost_per_kg_usd: number
  is_default: boolean
  is_active: boolean
}

const shippingModeConfig: Record<ShippingMode, { label: string; icon: typeof Ship; className: string }> = {
  Sea: { label: 'Sea', icon: Ship, className: 'bg-blue-100 text-blue-700' },
  Air: { label: 'Air', icon: Plane, className: 'bg-orange-100 text-orange-700' },
  Express: { label: 'Express', icon: Truck, className: 'bg-red-100 text-red-700' },
}

interface NewRouteFormData {
  route_code: string
  route_name: string
  origin_country: string
  destination_region: string
  shipping_mode: ShippingMode
  transit_time_weeks: number
  cost_per_kg_usd: number
  is_default: boolean
  is_active: boolean
}

const initialFormData: NewRouteFormData = {
  route_code: '',
  route_name: '',
  origin_country: 'China',
  destination_region: 'USA',
  shipping_mode: 'Sea',
  transit_time_weeks: 5,
  cost_per_kg_usd: 2.5,
  is_default: false,
  is_active: true,
}

export function LogisticsRoutesTable() {
  const [routes, setRoutes] = useState<LogisticsRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState<NewRouteFormData>(initialFormData)
  const { toasts, showToast, dismissToast } = useToast()

  // Load data on mount
  useEffect(() => {
    async function loadRoutes() {
      try {
        setLoading(true)
        const result = await getLogisticsRoutes()
        if (result.success && result.data) {
          setRoutes(result.data)
        } else {
          showToast(result.error || 'Failed to load routes', 'error')
        }
      } catch (error) {
        showToast('Failed to load routes', 'error')
      } finally {
        setLoading(false)
      }
    }
    loadRoutes()
  }, [])

  // Handle inline field update
  async function handleFieldUpdate(
    routeId: string,
    field: keyof LogisticsRoute,
    value: string | number | boolean
  ) {
    // Optimistic update
    const originalRoutes = [...routes]
    setRoutes((prev) =>
      prev.map((r) => (r.id === routeId ? { ...r, [field]: value } : r))
    )

    try {
      setSavingId(routeId)
      const result = await updateLogisticsRoute(routeId, { [field]: value })
      if (!result.success) {
        // Revert on error
        setRoutes(originalRoutes)
        showToast(result.error || 'Failed to update route', 'error')
      }
    } catch (error) {
      setRoutes(originalRoutes)
      showToast('Failed to update route', 'error')
    } finally {
      setSavingId(null)
    }
  }

  // Handle delete route
  async function handleDelete(routeId: string) {
    if (!confirm('Are you sure you want to delete this route?')) return

    try {
      setDeletingId(routeId)
      const result = await deleteLogisticsRoute(routeId)
      if (result.success) {
        setRoutes((prev) => prev.filter((r) => r.id !== routeId))
        showToast('Route deleted successfully', 'success')
      } else {
        showToast(result.error || 'Failed to delete route', 'error')
      }
    } catch (error) {
      showToast('Failed to delete route', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // Handle create new route
  async function handleCreate() {
    if (!formData.route_code || !formData.route_name) {
      showToast('Route code and name are required', 'error')
      return
    }

    try {
      setIsCreating(true)
      const result = await createLogisticsRoute(formData)
      if (result.success && result.data) {
        const newRoute = result.data
        setRoutes((prev) => [...prev, newRoute])
        setFormData(initialFormData)
        setIsDialogOpen(false)
        showToast('Route created successfully', 'success')
      } else {
        showToast(result.error || 'Failed to create route', 'error')
      }
    } catch (error) {
      showToast('Failed to create route', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Logistics Routes</CardTitle>
          <CardDescription>Configure shipping lanes and transit times</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading routes...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Logistics Routes</CardTitle>
            <CardDescription>Configure shipping lanes and transit times</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Route
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add New Route</DialogTitle>
                <DialogDescription>
                  Configure a new logistics route for shipments.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="route_code">Route Code</Label>
                    <Input
                      id="route_code"
                      value={formData.route_code}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, route_code: e.target.value }))
                      }
                      placeholder="e.g., CN-US-SEA-01"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="route_name">Route Name</Label>
                    <Input
                      id="route_name"
                      value={formData.route_name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, route_name: e.target.value }))
                      }
                      placeholder="e.g., China to USA Sea"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="origin_country">Origin Country</Label>
                    <Input
                      id="origin_country"
                      value={formData.origin_country}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, origin_country: e.target.value }))
                      }
                      placeholder="e.g., China"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination_region">Destination Region</Label>
                    <Input
                      id="destination_region"
                      value={formData.destination_region}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, destination_region: e.target.value }))
                      }
                      placeholder="e.g., USA"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Shipping Mode</Label>
                  <RadixSelect
                    value={formData.shipping_mode}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, shipping_mode: v as ShippingMode }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sea">
                        <span className="flex items-center gap-2">
                          <Ship className="h-4 w-4" /> Sea
                        </span>
                      </SelectItem>
                      <SelectItem value="Air">
                        <span className="flex items-center gap-2">
                          <Plane className="h-4 w-4" /> Air
                        </span>
                      </SelectItem>
                      <SelectItem value="Express">
                        <span className="flex items-center gap-2">
                          <Truck className="h-4 w-4" /> Express
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </RadixSelect>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="transit_time">Transit Time (weeks)</Label>
                    <Input
                      id="transit_time"
                      type="number"
                      value={formData.transit_time_weeks}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          transit_time_weeks: parseInt(e.target.value) || 0,
                        }))
                      }
                      min={1}
                      max={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cost_per_kg">Cost per kg (USD)</Label>
                    <Input
                      id="cost_per_kg"
                      type="number"
                      value={formData.cost_per_kg_usd}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          cost_per_kg_usd: parseFloat(e.target.value) || 0,
                        }))
                      }
                      min={0}
                      step={0.1}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_default}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, is_default: checked }))
                      }
                    />
                    <Label>Default Route</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, is_active: checked }))
                      }
                    />
                    <Label>Active</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Route'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Ship className="h-12 w-12 mb-4 opacity-30" />
              <p>No logistics routes configured yet.</p>
              <p className="text-sm">Click "Add Route" to create one.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead>Origin - Destination</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Transit (weeks)</TableHead>
                    <TableHead>Cost/kg</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.map((route) => {
                    const modeConfig = shippingModeConfig[route.shipping_mode]
                    const ModeIcon = modeConfig.icon
                    const isSaving = savingId === route.id
                    const isDeleting = deletingId === route.id

                    return (
                      <TableRow
                        key={route.id}
                        className={!route.is_active ? 'opacity-50' : ''}
                      >
                        <TableCell>
                          <div>
                            <div className="font-mono text-sm font-medium">
                              {route.route_code}
                            </div>
                            <div className="text-xs text-gray-500">
                              {route.route_name}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-gray-900">
                            {route.origin_country} {'->'} {route.destination_region}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={modeConfig.className}>
                            <ModeIcon className="h-3 w-3 mr-1" />
                            {modeConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={route.transit_time_weeks}
                            onChange={(e) =>
                              handleFieldUpdate(
                                route.id,
                                'transit_time_weeks',
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-20"
                            min={1}
                            max={20}
                            disabled={isSaving}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">$</span>
                            <Input
                              type="number"
                              value={route.cost_per_kg_usd}
                              onChange={(e) =>
                                handleFieldUpdate(
                                  route.id,
                                  'cost_per_kg_usd',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-24"
                              min={0}
                              step={0.1}
                              disabled={isSaving}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={route.is_default}
                            onCheckedChange={(checked) =>
                              handleFieldUpdate(route.id, 'is_default', checked)
                            }
                            disabled={isSaving}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={route.is_active}
                            onCheckedChange={(checked) =>
                              handleFieldUpdate(route.id, 'is_active', checked)
                            }
                            disabled={isSaving}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(route.id)}
                            disabled={isDeleting || isSaving}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
