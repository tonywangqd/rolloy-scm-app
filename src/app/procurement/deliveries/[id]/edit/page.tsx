import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { DeliveryEditForm } from '@/components/procurement/delivery-edit-form'
import { fetchDeliveryForEdit } from '@/lib/queries/procurement'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function DeliveryEditPage({ params }: PageProps) {
  const resolvedParams = await params
  const { data, error } = await fetchDeliveryForEdit(resolvedParams.id)

  if (error || !data) {
    notFound()
  }

  return (
    <>
      <Header
        title="编辑交付记录"
        description={`Edit Delivery Record - ${data.delivery.delivery_number}`}
      />
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Breadcrumb */}
          <Link
            href={`/procurement/${data.po.id}`}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回订单详情 Back to PO
          </Link>

          {/* Page Header */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-gray-900">
              编辑交付记录 Edit Delivery Record
            </h1>
            <p className="text-sm text-gray-600">
              Delivery #{data.delivery.delivery_number} | PO #{data.po.po_number}
            </p>
          </div>

          {/* Form */}
          <DeliveryEditForm context={data} />
        </div>
      </div>
    </>
  )
}
