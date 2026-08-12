import type { Metadata } from 'next'
import { MomentsShare } from '@/components/kenyatrace/moments-share'

export const metadata: Metadata = { title: 'Shared trip moments' }

export default async function MomentsSharePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  return <MomentsShare tripId={tripId} />
}
