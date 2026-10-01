'use client'

import Link from 'next/link'
import { ArrowRight, BedDouble, MapPin, Plus, RefreshCw, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SuggestedBadge, VerifiedBadge } from '@/components/ui/kt/badges'
import { Card, CardContent } from '@/components/ui/card'
import { formatKES } from '@/lib/kenya-data'
import { haversineKm } from '@/lib/travel'
import type { Doc } from '@/convex/_generated/dataModel'
import { ListingImage } from './shared'
import type { Stop } from './types'

/**
 * A real, verified stay from the catalog that can be swapped in or added to
 * the plan. `km` is the straight-line distance from the stay it would replace
 * (null when there's no anchor coordinate to measure from).
 */
export type StayAlternative = {
  id: string
  name: string
  location: string
  price: number
  unit: string
  rating: number
  lat: number
  lng: number
  image: string
  km: number | null
}

/** How far (km) an alternative can be from the planned stay and still count as "nearby". */
const NEARBY_KM = 40
const MAX_ALTERNATIVES = 3

type StayListing = Doc<'listings'>

/** One place the plan sleeps at, plus every stop index and night that belongs to it. */
type StayGroup = {
  key: string
  indexes: number[]
  days: number[]
  stop: Stop
}

function groupStays(stops: Stop[]): StayGroup[] {
  const groups = new Map<string, StayGroup>()
  stops.forEach((s, i) => {
    if (s.kind !== 'Stay') return
    // Verified stays group by their real listing; AI-drafted gap stays group by name+place.
    const key = s.listingId ?? `${s.title}::${s.place}`
    let group = groups.get(key)
    if (!group) {
      group = { key, indexes: [], days: [], stop: s }
      groups.set(key, group)
    }
    group.indexes.push(i)
    if (!group.days.includes(s.day)) group.days.push(s.day)
  })
  return [...groups.values()]
}

/** Ranks real stays like a local would: rating first, then fit for the budget, then closeness. */
function scoreStay(l: StayListing, km: number, budgetPerDay: number): number {
  let score = (l.rating || 0) * 10
  if (l.price > 0 && l.price <= budgetPerDay * 1.6) score += 3
  else if (l.price > budgetPerDay * 3) score -= 5
  score -= km * 0.08
  return score
}

function toAlternative(l: StayListing, km: number | null): StayAlternative {
  return {
    id: l._id,
    name: l.name,
    location: l.location,
    price: l.price,
    unit: l.unit,
    rating: l.rating,
    lat: l.lat,
    lng: l.lng,
    image: l.image,
    km,
  }
}

/**
 * The best verified catalog stays within `NEARBY_KM` of a coordinate. Never
 * invents anything — every card is a real listing.
 */
function nearbyStaysFrom(anchorLat: number, anchorLng: number, excludeId: string | undefined, listings: StayListing[] | undefined, budgetPerDay: number): StayAlternative[] {
  if (!listings) return []
  return listings
    .filter(l => l.vertical === 'stays' && l.lat != null && l.lng != null && l._id !== excludeId)
    .map(l => ({ l, km: haversineKm(anchorLat, anchorLng, l.lat!, l.lng!) }))
    .filter(x => x.km <= NEARBY_KM)
    .map(x => ({ ...x, score: scoreStay(x.l, x.km, budgetPerDay) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ALTERNATIVES)
    .map(x => toAlternative(x.l, x.km))
}

/** Top stays by rating and budget fit — used when the plan has no coordinates to measure from. */
function topStays(listings: StayListing[] | undefined, budgetPerDay: number): StayAlternative[] {
  if (!listings) return []
  return listings
    .filter(l => l.vertical === 'stays')
    .map(l => ({ l, score: scoreStay(l, 0, budgetPerDay) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ALTERNATIVES)
    .map(x => toAlternative(x.l, null))
}

/** One compact stay card, used for both swap alternatives and one-click adds. */
function StayOptionCard({ alt, action, actionLabel, actionAria }: {
  alt: StayAlternative
  action: () => void
  actionLabel: React.ReactNode
  actionAria: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-none border bg-card">
      <Link href={`/discover/stays/${alt.id}`} className="block">
        <div className="relative aspect-[16/9] overflow-hidden">
          <ListingImage src={alt.image} alt={alt.name} fill className="object-cover" sizes="200px" />
          <span className="absolute left-2 top-2 rounded-none bg-white/95 px-2 py-0.5 text-[11px] font-bold text-foreground shadow-sm">
            {formatKES(alt.price)}<span className="font-medium text-muted-foreground"> / {alt.unit}</span>
          </span>
          {alt.rating > 0 && (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-none bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
              <Star className="size-3 fill-amber-400 text-amber-400" />{alt.rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="p-2.5">
          <p className="truncate text-sm font-semibold">{alt.name}</p>
          <p className="truncate text-xs text-muted-foreground">{alt.location}{alt.km != null ? ` · ${Math.round(alt.km)} km away` : ''}</p>
        </div>
      </Link>
      <Button size="sm" variant="outline" className="mb-2 mt-0 w-[calc(100%-1rem)]" onClick={action} aria-label={actionAria}>
        {actionLabel}
      </Button>
    </div>
  )
}

/**
 * The post-planning accommodation section: every place the plan sleeps at,
 * night by night, each followed by real nearby alternatives the traveller
 * can swap in. When the plan has no overnight stop, suggests verified stays
 * near the destination the traveller can add in one click. Mirrors the
 * "Where you'll stay" flow of leading AI planners: the route first, then
 * where you sleep, then the daily activities.
 */
export function WhereYouStay({ stops, listings, budgetPerDay, origin, destination, onSwap, onAdd }: {
  stops: Stop[]
  listings?: StayListing[]
  budgetPerDay: number
  origin: string
  destination: string
  onSwap: (indexes: number[], alt: StayAlternative) => void
  onAdd: (alt: StayAlternative) => void
}) {
  const groups = groupStays(stops)
  const nights = stops.filter(s => s.kind === 'Stay').length

  // When the plan never sleeps, anchor "nearby" at the last known stop
  // (the destination) so the suggestions are actually close to the route.
  const anchor = [...stops].reverse().find(s => s.lat != null && s.lng != null)
  const suggestions = anchor
    ? nearbyStaysFrom(anchor.lat!, anchor.lng!, undefined, listings, budgetPerDay)
    : topStays(listings, budgetPerDay)

  return (
    <section aria-labelledby="where-you-stay-title" className="flex flex-col gap-4">
      <div>
        <h2 id="where-you-stay-title" className="flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight">
          <BedDouble className="size-5 text-primary" /> Where you&apos;ll stay
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {groups.length > 0
            ? `${nights} night${nights === 1 ? '' : 's'} of verified stays — swap any of them for a nearby alternative.`
            : `This plan runs as day trips from ${origin} — add a verified stay near ${destination} whenever you're ready.`}
        </p>
      </div>

      {groups.length === 0 ? (
        suggestions.length > 0 ? (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm font-semibold">Pick somewhere to stay</p>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/discover/stays?q=${encodeURIComponent(destination)}`} />} className="gap-1.5">
                  Browse all stays <ArrowRight className="size-3.5" />
                </Button>
              </div>
              <div className="grid gap-3 border-t p-4 sm:grid-cols-3">
                {suggestions.map(alt => (
                  <StayOptionCard
                    key={alt.id}
                    alt={alt}
                    actionAria={`Add ${alt.name} to the plan`}
                    actionLabel={<><Plus className="size-3.5" /> Add to plan</>}
                    action={() => onAdd(alt)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="p-5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-0">
              <p className="text-sm text-muted-foreground">Want to sleep under the stars instead? Browse verified stays near {destination}.</p>
              <Button variant="outline" nativeButton={false} render={<Link href={`/discover/stays?q=${encodeURIComponent(destination)}`} />} className="gap-2">
                Browse stays <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        )
      ) : (
        groups.map(group => {
          const s = group.stop
          const alts = s.lat != null && s.lng != null
            ? nearbyStaysFrom(s.lat, s.lng, s.listingId, listings, budgetPerDay)
            : []
          return (
            <Card key={group.key} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                  {s.image ? (
                    <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-none sm:h-28 sm:w-44">
                      <ListingImage src={s.image} alt={s.title} fill className="object-cover" sizes="176px" />
                    </div>
                  ) : (
                    <div className="flex h-40 w-full shrink-0 items-center justify-center rounded-none bg-muted sm:h-28 sm:w-44">
                      <BedDouble className="size-8 text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {s.verified && s.listingId ? (
                          <Link href={`/discover/stays/${s.listingId}`} className="transition-colors hover:text-primary hover:underline underline-offset-2">{s.title}</Link>
                        ) : (
                          s.title
                        )}
                      </p>
                      <Badge className="text-[10px]">Stay</Badge>
                      {s.verified ? (
                        <VerifiedBadge className="text-[10px]" />
                      ) : (
                        <SuggestedBadge className="text-[10px]" />
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground"><MapPin className="mr-1 inline size-3.5 align-[-2px]" />{s.place}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {group.days.map(d => (
                        <span key={d} className="rounded-none bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">Night {d}</span>
                      ))}
                      {group.days.length > 1 && <span className="text-xs text-muted-foreground">{group.days.length} nights</span>}
                    </div>
                    {s.reason && <p className="mt-2 text-sm italic text-muted-foreground/80">{s.reason}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <span className="text-lg font-bold text-primary">
                      {s.verified ? formatKES(s.cost) : `~${formatKES(s.cost)}`}
                      <span className="text-xs font-medium text-muted-foreground"> / {s.verified ? (s.unit ?? 'night') : 'est.'}</span>
                    </span>
                    {s.verified && s.listingId && (
                      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/discover/stays/${s.listingId}`} />}>Details</Button>
                    )}
                  </div>
                </div>

                {alts.length > 0 && (
                  <div className="border-t bg-secondary/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Also nearby · swap anytime</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      {alts.map(alt => (
                        <StayOptionCard
                          key={alt.id}
                          alt={alt}
                          actionAria={`Swap to ${alt.name}`}
                          actionLabel={<><RefreshCw className="size-3.5" /> Swap</>}
                          action={() => onSwap(group.indexes, alt)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })
      )}
    </section>
  )
}
