import type { Metadata } from 'next'
import { RecapView } from '@/components/kenyatrace/recap-view'
import { shareMeta } from '@/lib/share-meta'

/**
 * Public, shareable 9-grid recap — the traveller's best moments from a trip
 * in a single 3×3 card. Works without an account, like the trace page.
 * Metadata is resolved from the real trip so social embeds show it.
 */
export async function generateMetadata({ params }: { params: Promise<{ tripId: string }> }): Promise<Metadata> {
  const { tripId } = await params
  const meta = await shareMeta('recap', tripId)
  return {
    title: meta.title,
    description: meta.description,
    openGraph: { title: meta.title, description: meta.description, images: meta.image ? [meta.image] : [] },
    twitter: { card: 'summary_large_image', title: meta.title, description: meta.description, images: meta.image ? [meta.image] : [] },
  }
}

export default async function RecapPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  return <RecapView tripId={tripId} />
}
