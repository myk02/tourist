import type { Metadata } from 'next'
import { Trips } from '@/components/kenyatrace/trips-page'

export const metadata: Metadata = { title: 'Trips' }

export default function TripsPage() {
  return <Trips />
}
