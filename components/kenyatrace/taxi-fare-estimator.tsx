'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { SignInButton, useUser } from '@clerk/nextjs'
import { toast } from 'sonner'
import { ArrowLeftRight, BadgeCheck, Car, Info, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatKES } from '@/lib/kenya-data'
import { TAXI_PLACES, estimateRoute, type TaxiPlace } from '@/lib/taxi-fares'
import { toReplaceStopsPayload } from '@/lib/stop-fields'

/**
 * Interactive taxi fare estimator for the Discover → Taxis page.
 *
 * Pick any pickup/dropoff pair from the curated place list and get live
 * per-provider fare estimates (Uber, Bolt, Little Cab, Maramoja). Quotes can
 * be added to a trip as a Transport stop, and popular routes deep-link to
 * their bookable listing on the same page.
 */
export function TaxiFareEstimator({ routes }: { routes: { _id: string; name: string; location: string }[] }) {
  const { isSignedIn } = useUser()
  const [pickupName, setPickupName] = useState('JKIA (NBO)')
  const [dropoffName, setDropoffName] = useState('Nairobi CBD')
  const [addingService, setAddingService] = useState<string | null>(null)
  const signInRef = useRef<HTMLDivElement>(null)
  const trips = useQuery(api.trips.list)
  const replaceStops = useMutation(api.trips.replaceStops)
  const editableTrips = (trips ?? []).filter(t => t.role !== 'viewer')
  const [tripId, setTripId] = useState<Id<'trips'> | null>(null)
  // Only fetch stops once a trip is picked ('skip' otherwise).
  const trip = useQuery(api.trips.getWithStops, tripId ? { id: tripId } : 'skip')

  const pickup = TAXI_PLACES.find(p => p.name === pickupName) ?? TAXI_PLACES[0]
  const dropoff = TAXI_PLACES.find(p => p.name === dropoffName) ?? TAXI_PLACES[1]
  const estimate = useMemo(() => estimateRoute(pickup, dropoff), [pickup, dropoff])
  const cheapest = useMemo(() => Math.min(...estimate.quotes.map(q => q.price)), [estimate])

  function swap() {
    setPickupName(dropoffName)
    setDropoffName(pickupName)
  }

  // Popular curated routes on this vertical — deep-link when the estimate
  // matches one, so travellers can reserve the real route listing.
  const matchingRoute = useMemo(() => {
    const pickupWords = pickup.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3)
    const dropoffWords = dropoff.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3)
    return routes.find(r => {
      const text = `${r.name} ${r.location}`.toLowerCase()
      const hasPickup = pickupWords.some(w => text.includes(w))
      const hasDropoff = dropoffWords.some(w => text.includes(w))
      return hasPickup && hasDropoff
    })
  }, [routes, pickup.name, dropoff.name])

  async function addQuoteToTrip(service: string, price: number) {
    if (!tripId || !trip) return
    setAddingService(service)
    try {
      const existing = toReplaceStopsPayload(trip.stops)
      await replaceStops({
        tripId,
        stops: [...existing, {
          name: `${service} · ${pickup.name} → ${dropoff.name}`,
          place: `${pickup.name} → ${dropoff.name}`,
          day: Math.max(...(existing.length ? existing.map(s => s.day) : [0]), 1),
          time: '09:00',
          cost: price,
          kind: 'Transport',
          order: existing.length,
          lat: dropoff.lat,
          lng: dropoff.lng,
        }],
      })
      toast.success(`Added ${service} estimate to your trip`)
    } catch {
      toast.error('Could not add this ride to your trip')
    } finally {
      setAddingService(null)
    }
  }

  function handleAddQuote(service: string, price: number) {
    if (!isSignedIn) {
      signInRef.current?.click()
      return
    }
    if (!tripId) {
      toast.error('Choose a trip first')
      return
    }
    void addQuoteToTrip(service, price)
  }

  return (
    <Card className="shadow-soft">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"><Car className="size-4.5" /></span>
          <div>
            <h2 className="font-serif text-xl font-semibold tracking-tight">Estimate your ride</h2>
            <p className="text-xs text-muted-foreground">Compare Uber, Bolt, Little Cab and Maramoja before you book.</p>
          </div>
        </div>

        <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <Select value={pickupName} onValueChange={v => { const next = v || pickupName; setPickupName(next); if (next === dropoffName) setDropoffName(pickupName) }}>
            <SelectTrigger aria-label="Pickup"><SelectValue placeholder="Pickup" /></SelectTrigger>
            <SelectContent>
              {TAXI_PLACES.map(p => (
                <SelectItem key={p.name} value={p.name} disabled={p.name === dropoffName}>
                  {p.name} · {p.area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" aria-label="Swap pickup and dropoff" className="mx-auto" onClick={swap}>
            <ArrowLeftRight className="size-4" />
          </Button>
          <Select value={dropoffName} onValueChange={v => { const next = v || dropoffName; setDropoffName(next); if (next === pickupName) setPickupName(dropoffName) }}>
            <SelectTrigger aria-label="Dropoff"><SelectValue placeholder="Dropoff" /></SelectTrigger>
            <SelectContent>
              {TAXI_PLACES.map(p => (
                <SelectItem key={p.name} value={p.name} disabled={p.name === pickupName}>
                  {p.name} · {p.area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{pickup.name} → {dropoff.name}</span>
          <span>≈ {estimate.distanceKm.toFixed(0)} km</span>
          <span>≈ {estimate.durationMin} min</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {estimate.quotes.map(quote => (
            <div
              key={quote.service}
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl border p-3',
                quote.price === cheapest ? 'border-primary/50 bg-primary/5' : 'border-border',
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  {quote.name}
                  {quote.price === cheapest && <BadgeCheck className="size-3.5 shrink-0 text-primary" />}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {quote.tagline} · <Star className="inline size-3 fill-amber-400 text-amber-400" /> {quote.rating.toFixed(1)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold">{formatKES(quote.price)}</p>
                <p className="text-[11px] text-muted-foreground">per ride</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-1.5 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Estimates only — actual fares vary with traffic, surge pricing and time of day.
          </div>
          {isSignedIn && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={tripId?.toString() || ''} onValueChange={v => setTripId(v ? (v as Id<'trips'>) : null)}>
                <SelectTrigger className="sm:w-[220px]" aria-label="Trip for ride estimate"><SelectValue placeholder="Add to trip…" /></SelectTrigger>
                <SelectContent>
                  {editableTrips.length === 0
                    ? <div className="px-3 py-2 text-sm text-muted-foreground">No trips yet</div>
                    : editableTrips.map(t => <SelectItem key={t._id} value={t._id}>{t.name}{t.role !== 'owner' ? ' · Shared' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!tripId || !trip || addingService !== null}
                onClick={() => handleAddQuote(cheapestQuoteName(estimate), cheapest)}
              >
                {addingService !== null ? 'Adding…' : `Add cheapest (${formatKES(cheapest)}) to trip`}
              </Button>
            </div>
          )}
          {matchingRoute && (
            <Link
              href={`/discover/taxis/${matchingRoute._id}`}
              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Popular route — reserve {matchingRoute.name} →
            </Link>
          )}
        </div>
      </CardContent>
      <SignInButton mode="modal"><div ref={signInRef} style={{ display: 'none' }} /></SignInButton>
    </Card>
  )
}

function cheapestQuoteName(estimate: ReturnType<typeof estimateRoute>): string {
  return estimate.quotes.reduce((best, q) => (q.price < best.price ? q : best), estimate.quotes[0]).name
}
