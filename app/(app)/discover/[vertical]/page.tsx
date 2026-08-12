import type { Metadata } from 'next'
import { DiscoverPage } from '@/components/kenyatrace/discover-page'
import type { Vertical } from '@/lib/kenya-data'

export const metadata: Metadata = { title: 'Explore Kenya' }

export default async function DiscoverVerticalPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params
  return <DiscoverPage vertical={vertical as Vertical} />
}
