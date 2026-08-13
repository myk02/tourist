import type { Metadata } from 'next'
import { TraceView } from '@/components/kenyatrace/trace-view'
import { shareMeta } from '@/lib/share-meta'

/**
 * Public, shareable live-trace page — the token (?t=) acts as the password.
 * Sits outside the app shell so the owner can paste the link anywhere.
 * The metadata is resolved from the real trip so social embeds show it.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { t } = await searchParams
  const meta = await shareMeta('trace', id, t)
  return {
    title: meta.title,
    description: meta.description,
    openGraph: { title: meta.title, description: meta.description, images: meta.image ? [meta.image] : [] },
  }
}

export default async function TracePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t } = await searchParams
  return <TraceView tripId={id} token={t ?? ''} />
}
