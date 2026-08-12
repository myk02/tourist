import type { Metadata } from 'next'
import { DiscoverPage } from '@/components/kenyatrace/discover-page'

export const metadata: Metadata = { title: 'Explore Kenya' }

export default function DiscoverIndexPage() {
  return <DiscoverPage vertical="stays" />
}
