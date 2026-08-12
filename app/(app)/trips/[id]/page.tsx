import type { Metadata } from 'next'
import { TripDetail } from '@/components/kenyatrace/trip-detail'

export const metadata: Metadata = { title: 'Trip' }

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await params
  return <TripDetail />
}
