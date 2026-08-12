import type { Metadata } from 'next'
import { Track } from '@/components/kenyatrace/live-page'

export const metadata: Metadata = { title: 'Live tracking' }

export default async function TripTrackPage({ params }: { params: Promise<{ id: string }> }) {
  await params
  return <Track />
}
