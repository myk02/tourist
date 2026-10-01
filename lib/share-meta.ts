import { ConvexHttpClient } from 'convex/browser'
import { prettyDate } from './dates'

/**
 * Share-link SEO: resolves real titles, descriptions and images for the
 * public share pages (/trace, /recap, /moments/[tripId]) straight from
 * Convex at request time, so social embeds and search results show the
 * actual trip instead of a generic title. Every failure falls back to a
 * safe default — a broken meta query must never break the page.
 */

export interface ShareMeta {
  title: string
  description: string
  image?: string
}

const FALLBACK: Record<'trace' | 'recap' | 'moments', ShareMeta> = {
  trace: { title: 'Trip trace · KenyaTrace', description: 'A Kenya trip, planned with KenyaTrace.', image: '/kenya-hero.png' },
  recap: { title: 'Trip recap · KenyaTrace', description: 'A Kenya trip, planned with KenyaTrace.', image: '/kenya-hero.png' },
  moments: { title: 'Shared trip moments · KenyaTrace', description: 'A Kenya trip, planned with KenyaTrace.', image: '/kenya-hero.png' },
}

interface TraceData {
  trip?: { name?: string; destination?: string; origin?: string; startDate?: string; endDate?: string; coverImage?: string }
  distanceKm?: number
}

interface MomentsData {
  trip?: { name?: string; destination?: string; origin?: string; startDate?: string; endDate?: string }
  moments?: { imageUrl?: string | null; imageUrls?: string[] }[]
}

type QueryFn = (name: string, args: Record<string, unknown>) => Promise<unknown>

export async function shareMeta(kind: 'trace' | 'recap' | 'moments', tripId: string, token?: string): Promise<ShareMeta> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) return FALLBACK[kind]
  let client: ConvexHttpClient | null = null
  try {
    client = new ConvexHttpClient(url)
    const query = client.query as unknown as QueryFn
    if (kind === 'trace') {
      const data = (await query('trips:publicTrace', { tripId, token: token ?? '' })) as TraceData | null
      if (!data?.trip?.name) return FALLBACK.trace
      return {
        title: `Trip trace · ${data.trip.name}`,
        description: `${data.trip.destination ?? 'Kenya'}${data.trip.startDate ? ` · ${prettyDate(data.trip.startDate)} → ${data.trip.endDate ? prettyDate(data.trip.endDate) : ''}` : ''}${data.distanceKm ? ` · ${data.distanceKm} km traced` : ''}. Follow the route with KenyaTrace.`,
        image: data.trip.coverImage || '/kenya-hero.png',
      }
    }
    const data = (await query('moments:publicForTrip', { tripId, token: token ?? '' })) as MomentsData | null
    if (!data?.trip?.name) return FALLBACK[kind]
    const firstImage = data.moments?.map(m => m.imageUrl ?? m.imageUrls?.[0]).find(Boolean)
    return {
      title: kind === 'recap' ? `Trip recap · ${data.trip.name}` : `${data.trip.name} · shared moments`,
      description: `${data.trip.destination ?? 'Kenya'}${data.trip.startDate ? ` · ${prettyDate(data.trip.startDate)} → ${data.trip.endDate ? prettyDate(data.trip.endDate) : ''}` : ''}. Made with KenyaTrace.`,
      image: firstImage || '/kenya-hero.png',
    }
  } catch (err) {
    console.warn('[share-meta] meta query failed, using fallback', err)
    return FALLBACK[kind]
  } finally {
    // ConvexHttpClient has no close() — it's a stateless request client and
    // can be garbage-collected normally.
    void client
  }
}
