import type { Metadata } from 'next'
import { TripDetail } from '@/components/kenyatrace/trip-detail'

export const metadata: Metadata = { title: 'Trip' }

export default function TripDetailPage() {
  return <TripDetail />
}
