import type { Metadata } from 'next'
import { Track } from '@/components/kenyatrace/live-page'

export const metadata: Metadata = { title: 'Live tracking' }

export default function TripTrackPage() {
  return <Track />
}
