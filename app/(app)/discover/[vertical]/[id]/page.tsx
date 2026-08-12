import type { Metadata } from 'next'
import { Detail } from '@/components/kenyatrace/listing-detail'

export const metadata: Metadata = { title: 'Listing details' }

export default async function ListingDetailPage({ params }: { params: Promise<{ vertical: string; id: string }> }) {
  const { id } = await params
  return <Detail id={id} />
}
