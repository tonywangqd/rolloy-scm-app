import { fetchAllProducts, fetchAllChannels } from '@/lib/queries/settings'
import ForecastWizardClient from './forecast-wizard-client'

export default async function ForecastWizardPage() {
  // Fetch products and channels for the wizard
  const products = await fetchAllProducts()
  const channels = await fetchAllChannels()

  // Transform to only include necessary fields
  const productOptions = products.map((p) => ({
    sku: p.sku,
    product_name: p.product_name,
  }))

  const channelOptions = channels.map((c) => ({
    channel_code: c.channel_code,
    channel_name: c.channel_name,
  }))

  return <ForecastWizardClient products={productOptions} channels={channelOptions} />
}
