import type { Doc, Id } from '@/convex/_generated/dataModel'
import { dailyAllowance } from '@/lib/budget'
import { formatKES } from '@/lib/kenya-data'
import { haversineKm } from '@/lib/travel'
import type { Stop } from '../types'
import type { StayAlternative } from '../where-you-stay'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Traveler = 'citizen' | 'tourist' | 'foreigner'
export type Stage = 'where' | 'budget' | 'plan' | 'track' | 'share' | 'done'

export interface JourneyLeg { from: string; to: string; how: string; distanceKm: number; timeMins: number; cost: number }
export interface JourneyPlan { name: string; destination: string; summary: string; originNote: string; journey: JourneyLeg[]; stops: Stop[] }

export interface Draft {
  origin: string
  originLat?: number
  originLng?: number
  traveler: Traveler | null
  days: number
  interests: string[]
  budget: number
  pace: 'relaxed' | 'balanced' | 'full'
  extra: string
  // "YYYY-MM" — when the traveller is going. Drives season-aware planning.
  travelMonth: string
  plan: JourneyPlan | null
  tripId: Id<'trips'> | null
  rating: number
  review: string
  published: boolean
}

export type ListingDoc = Doc<'listings'>

export interface PlannerModel { label: string; origin: string; traveler: Traveler; days: number; budget: number }

/** Marker prepended to draft.extra for hints the traveller pasted themselves,
 *  so repeat pastes replace instead of piling up. */
export const PASTE_HINT_PREFIX = '[From my notes] '

/** Marker for destination hints handed over from a shared trace page. */
export const TRACE_HINT_PREFIX = '[From a shared trip] '

export interface MapPoint { id: string; name: string; location: string; lat: number; lng: number }
export interface PickedFile { file: File; video: boolean }

// ─── Constants ────────────────────────────────────────────────────────────────

export const DRAFT_KEY = 'ktJourneyDraft'

export const TOWNS: { name: string; lat: number; lng: number }[] = [
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219 },
  { name: 'Mombasa', lat: -4.0435, lng: 39.6682 },
  { name: 'Kisumu', lat: -0.0917, lng: 34.768 },
  { name: 'Nakuru', lat: -0.3031, lng: 36.08 },
  { name: 'Eldoret', lat: 0.5143, lng: 35.2698 },
  { name: 'Nyeri', lat: -0.4201, lng: 36.9476 },
  { name: 'Naivasha', lat: -0.7172, lng: 36.431 },
  { name: 'Malindi', lat: -3.2176, lng: 40.1165 },
  { name: 'Lamu', lat: -2.2711, lng: 40.902 },
  { name: 'Watamu', lat: -3.352, lng: 40.038 },
  { name: 'Diani', lat: -4.3155, lng: 39.581 },
  { name: 'Thika', lat: -1.0331, lng: 37.0693 },
  { name: 'Kitale', lat: 1.0157, lng: 35.0062 },
  { name: 'Machakos', lat: -1.5177, lng: 37.2634 },
  { name: 'Embu', lat: -0.5316, lng: 37.45 },
  { name: 'Meru', lat: 0.05, lng: 37.65 },
  { name: 'Maasai Mara', lat: -1.4, lng: 35.1333 },
  { name: 'Amboseli', lat: -2.65, lng: 37.26 },
]

export const BUDGETS = [5000, 15000, 30000, 60000, 120000, 250000]
export const INTERESTS = ['Wildlife', 'Safari', 'Beach', 'Food', 'Culture', 'Adventure', 'Local life', 'Hiking', 'Luxury', 'City']

export const TRAVELERS: { id: Traveler; label: string; text: string }[] = [
  { id: 'citizen', label: 'Kenyan citizen', text: 'Local rates, matatus, weekend trips' },
  { id: 'tourist', label: 'Tourist in Kenya', text: 'Safaris, coast, guided tours' },
  { id: 'foreigner', label: 'Foreigner abroad', text: 'First-time Kenya, flights, packages' },
]

export const JOURNEY_HERO = 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Kilimanjaro_from_Amboseli.jpg'

export const MODELS: PlannerModel[] = [
  { label: 'Mara escape', origin: 'Nairobi', traveler: 'tourist', days: 2, budget: 60000 },
  { label: 'Coast & beach', origin: 'Mombasa', traveler: 'tourist', days: 5, budget: 120000 },
  { label: 'Rift Valley', origin: 'Nakuru', traveler: 'citizen', days: 3, budget: 30000 },
]

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'where', label: 'Location' },
  { id: 'budget', label: 'Budget' },
  { id: 'plan', label: 'Plan' },
  { id: 'track', label: 'Track' },
  { id: 'share', label: 'Share' },
  { id: 'done', label: 'Done' },
]

export const GENERATION_STEPS = [
  'Reading your location and travel style…',
  'Choosing the best destinations from where you are…',
  'Working out how to get there and what it costs…',
  'Building your day-by-day Kenya plan…',
]

export function emptyDraft(): Draft {
  return {
    origin: '',
    traveler: null,
    days: 4,
    interests: ['Wildlife'],
    budget: 60000,
    pace: 'balanced',
    extra: '',
    travelMonth: '',
    plan: null,
    tripId: null,
    rating: 0,
    review: '',
    published: false,
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function formatMins(mins: number) {
  if (!mins || mins < 60) return `${mins || 0} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Converts plan stops to the row shape Convex trips persist (create + replace). */
export function toTripStops(stops: Stop[]) {
  return stops.map((s, i) => ({
    name: s.title, place: s.place, day: s.day, time: s.time, cost: s.cost, kind: s.kind, order: i,
    lat: s.lat, lng: s.lng, locked: s.locked, reason: s.reason, verified: s.verified, duration: s.duration,
    source: s.source, listingId: s.listingId, vertical: s.vertical, image: s.image,
    travelKm: s.travelKm, travelMins: s.travelMins, travelRouted: s.travelRouted, completedAt: s.completedAt,
  }))
}

/**
 * Rebuilds a stop around a real catalog stay — only real data (name, price,
 * coords, photo), a factual reason, and no stale routed drive times.
 */
export function stayPatch(base: Stop, alt: StayAlternative, prev?: Stop): Stop {
  const km = prev && prev.lat != null && prev.lng != null ? Math.round(haversineKm(prev.lat, prev.lng, alt.lat, alt.lng)) : null
  const bits = [
    km != null ? `${km} km from ${prev!.title}` : null,
    alt.rating > 0 ? `${alt.rating.toFixed(1)}★ rated` : null,
    `${formatKES(alt.price)}/${alt.unit}`,
  ].filter(Boolean)
  return {
    ...base,
    title: alt.name,
    place: alt.location,
    cost: alt.price,
    verified: true,
    source: 'catalog' as const,
    listingId: alt.id,
    vertical: 'stays',
    unit: alt.unit,
    image: alt.image,
    lat: alt.lat,
    lng: alt.lng,
    reason: bits.join(' · '),
    // The routed leg into this stop described the old geometry — clear it.
    travelKm: undefined,
    travelMins: undefined,
    travelRouted: undefined,
  }
}

/**
 * The free AI model sometimes omits coordinates — backfill them from the
 * verified listings database and the known-towns table.
 */
export function enrichStops(stops: Stop[], listings: { name: string; lat: number; lng: number }[] | undefined): Stop[] {
  return stops.map(s => {
    // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
    if (s.lat != null && s.lng != null) return s
    const t = norm(s.title)
    const listing = (listings ?? []).find(l => {
      const n = norm(l.name)
      if (n.length < 4) return false
      return n.includes(t) || (t.length >= 4 && t.includes(n))
    })
    if (listing) return { ...s, lat: listing.lat, lng: listing.lng }
    const town = TOWNS.find(tw => norm(tw.name) === norm(s.place) || (norm(s.place).length >= 4 && norm(s.place).includes(norm(tw.name))))
    if (town) return { ...s, lat: town.lat, lng: town.lng }
    return s
  })
}

export interface PlanCandidate {
  id: string
  vertical: string
  name: string
  location: string
  price: number
  unit: string
  rating: number
  reviews: number
  tags: string[]
  description: string
  lat?: number
  lng?: number
  image?: string
}

/**
 * Real, verified places from the catalog that fit this brief — sent to the AI
 * so it curates from real data instead of inventing names, prices and
 * coordinates. Shoestring trips stay close to the origin; generous budgets can
 * roam the whole country.
 */
export function pickPlanCandidates(
  listings: ListingDoc[] | undefined,
  budget: number,
  days: number,
  originLat?: number,
  originLng?: number,
): PlanCandidate[] {
  if (!listings) return []
  const perDay = dailyAllowance(budget, days)
  const maxDist = perDay < 6000 ? 200 : perDay < 15000 ? 400 : 1200
  const priceCaps: Record<string, number> = {
    stays: perDay * 1.6,
    flights: perDay * 3.5,
    taxis: perDay * 2,
    cars: perDay * 2,
    attractions: perDay * 1.2,
  }
  const hasOrigin = originLat != null && originLng != null
  return listings
    .map(l => {
      let score = l.rating || 0
      const cap = priceCaps[l.vertical] ?? perDay
      if (l.price > 0 && l.price <= cap) score += 2
      if (hasOrigin && l.lat != null) {
        const d = haversineKm(originLat!, originLng!, l.lat, l.lng)
        if (d > maxDist) score -= 4
        else if (d < 80) score += 1.5
      }
      return { l, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 60)
    .map(({ l }) => ({
      id: l._id,
      vertical: l.vertical,
      name: l.name,
      location: l.location,
      price: l.price,
      unit: l.unit,
      rating: l.rating,
      reviews: l.reviews,
      tags: l.tags,
      description: l.description,
      lat: l.lat,
      lng: l.lng,
      image: l.image,
    }))
}

export interface CatalogMatch {
  id: string
  name: string
  vertical: string
  location: string
  tags: string[]
}

/**
 * Start-from-anything v1: pure catalog matching over text the traveller
 * pasted in (a WhatsApp forward, a blog paragraph, a listing link). Finds
 * known towns and catalog places mentioned in the text — no AI call, nothing
 * invented. A pasted internal /discover/<vertical>/<id> link resolves
 * directly by id; everything else matches on place names.
 */
export function matchCatalogPlaces(text: string, listings: ListingDoc[] | undefined): { places: CatalogMatch[]; towns: string[] } {
  const hay = ` ${norm(text)} `
  if (!listings?.length || hay.trim().length < 8) return { places: [], towns: [] }

  // Pasted discover links resolve exactly, by listing id.
  const seen = new Set<string>()
  const places: CatalogMatch[] = []
  const linkIds = [...text.matchAll(/discover\/[a-z-]+\/([a-zA-Z0-9]+)/g)].map(m => m[1])
  for (const id of linkIds) {
    const l = listings.find(x => x._id === id)
    if (l && !seen.has(l._id)) {
      seen.add(l._id)
      places.push({ id: l._id, name: l.name, vertical: l.vertical, location: l.location, tags: l.tags })
    }
  }

  // Name matches, ranked by how loved the place is.
  const scored: { l: ListingDoc; score: number }[] = []
  for (const l of listings) {
    if (seen.has(l._id)) continue
    const n = norm(l.name)
    if (n.length < 4 || !hay.includes(` ${n} `)) continue
    scored.push({ l, score: (l.rating || 0) + Math.min(l.reviews, 200) / 100 })
  }
  scored.sort((a, b) => b.score - a.score)
  for (const { l } of scored.slice(0, 6)) {
    seen.add(l._id)
    places.push({ id: l._id, name: l.name, vertical: l.vertical, location: l.location, tags: l.tags })
  }

  const towns = TOWNS.map(t => t.name).filter(n => hay.includes(` ${norm(n)} `))
  return { places, towns }
}

/**
 * Maps matched catalog places back onto the planner's interest chips via their
 * real tags — only exact tag↔interest matches count, so seeding stays honest.
 */
export function interestsFromMatches(places: CatalogMatch[]): string[] {
  const hits = new Set<string>()
  for (const p of places) {
    for (const tag of p.tags) {
      const t = norm(tag)
      for (const i of INTERESTS) if (!hits.has(i) && norm(i) === t) hits.add(i)
    }
  }
  return [...hits]
}
