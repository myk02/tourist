import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DiscoverPage } from '@/components/kenyatrace/discover-page'
import { categories, type Vertical } from '@/lib/kenya-data'

export const metadata: Metadata = { title: 'Explore Kenya' }

const VERTICALS = categories.map(c => c.id)

export default async function DiscoverVerticalPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params
  // Unknown verticals are a 404, not a broken listing grid.
  if (!VERTICALS.includes(vertical as Vertical)) notFound()
  return <DiscoverPage vertical={vertical as Vertical} />
}
