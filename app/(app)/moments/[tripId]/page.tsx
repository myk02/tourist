import type { Metadata } from 'next'
import { MomentsShare } from '@/components/kenyatrace/moments-share'
import { shareMeta } from '@/lib/share-meta'

/**
 * Public shared-moments page. Metadata is resolved from the real trip (and
 * its first public photo) so social embeds and search results show it.
 */
export async function generateMetadata({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ t?: string }> }): Promise<Metadata> {
  const { tripId } = await params
  const { t } = await searchParams
  const meta = await shareMeta('moments', tripId, t)
  return {
    title: meta.title,
    description: meta.description,
    openGraph: { title: meta.title, description: meta.description, images: meta.image ? [meta.image] : [] },
    twitter: { card: 'summary_large_image', title: meta.title, description: meta.description, images: meta.image ? [meta.image] : [] },
  }
}

export default async function MomentsSharePage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ t?: string }> }) {
  const { tripId } = await params
  const { t } = await searchParams
  return <MomentsShare tripId={tripId} token={t ?? ''} />
}
