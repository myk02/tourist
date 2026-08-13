import type { Metadata } from 'next'
import { MomentsShare } from '@/components/kenyatrace/moments-share'
import { shareMeta } from '@/lib/share-meta'

/**
 * Public shared-moments page. Metadata is resolved from the real trip (and
 * its first public photo) so social embeds and search results show it.
 */
export async function generateMetadata({ params }: { params: Promise<{ tripId: string }> }): Promise<Metadata> {
  const { tripId } = await params
  const meta = await shareMeta('moments', tripId)
  return {
    title: meta.title,
    description: meta.description,
    openGraph: { title: meta.title, description: meta.description, images: meta.image ? [meta.image] : [] },
  }
}

export default async function MomentsSharePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  return <MomentsShare tripId={tripId} />
}
