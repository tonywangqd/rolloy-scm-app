'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SkuTieringTable } from '@/components/settings/sku-tiering-table'
import { CapitalConstraintsEditor } from '@/components/settings/capital-constraints-editor'
import { LogisticsRoutesTable } from '@/components/settings/logistics-routes-table'

export default function SimulationSettingsPage() {
  const [activeTab, setActiveTab] = useState('sku-tiering')

  return (
    <div className="flex flex-col h-full">
      <Header
        title="模拟参数"
        description="管理模拟模块的本体数据约束"
      />

      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="sku-tiering">产品分层</TabsTrigger>
            <TabsTrigger value="capital">资金约束</TabsTrigger>
            <TabsTrigger value="routes">物流路线</TabsTrigger>
          </TabsList>

          <TabsContent value="sku-tiering">
            <SkuTieringTable />
          </TabsContent>

          <TabsContent value="capital">
            <CapitalConstraintsEditor />
          </TabsContent>

          <TabsContent value="routes">
            <LogisticsRoutesTable />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
