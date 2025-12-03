/**
 * Algorithm Audit Page (Redirects to V3)
 * Path: /inventory/algorithm-audit
 */

import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<{ sku?: string }>
}

export default async function AlgorithmAuditPage({ searchParams }: PageProps) {
  const params = await searchParams

  // Redirect to V3 with same parameters
  const url = params.sku
    ? `/inventory/algorithm-audit-v3?sku=${params.sku}`
    : '/inventory/algorithm-audit-v3'

  redirect(url)
}
