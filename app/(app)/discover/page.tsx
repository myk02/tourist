import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Explore Kenya' }

export default function DiscoverIndexPage() {
  // /discover is an alias — the stays vertical is the canonical landing so
  // deep-links, metadata and analytics never split across two URLs.
  redirect('/discover/stays')
}
