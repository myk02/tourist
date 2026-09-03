'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Check, MapPin, Star, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/kt/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { isValidConvexId } from '@/lib/id'
import { localDateOnly } from '@/lib/dates'
import { formatKES } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { toReplaceStopsPayload } from '@/lib/stop-fields'
import { ListingImage, NotFound, SourceBadge, sourceToFilter } from './shared'
import { PaywallDialog } from './paywall'
import { KenyaMap } from './kenya-map'

/** Trip-stop kind for a listing vertical — transport verticals book as Transport stops, not Experience. */
function stopKindFor(vertical?: string): string {
  if (vertical === 'stays') return 'Stay'
  if (vertical === 'flights' || vertical === 'taxis' || vertical === 'cars') return 'Transport'
  return 'Experience'
}

export function Detail({ id }: { id: string }) {
  const { isSignedIn } = useUser()
  const clerk = useClerk()
  // A malformed /discover/<vertical>/<garbage> route must show NotFound, not
  // make Convex throw on an invalid id.
  const validId = isValidConvexId(id)
  const item = useQuery(api.listings.get, validId ? { id: id as Id<'listings'> } : 'skip')
  // The traveller's saved row for this listing (price at save time) — used to
  // flag a price drop since they saved it. Null for guests and non-savers.
  const savedEntry = useQuery(api.saved.find, validId ? { listingId: id as Id<'listings'> } : 'skip')
  const trips = useQuery(api.trips.list)
  const create = useMutation(api.trips.create)
  const replaceStops = useMutation(api.trips.replaceStops)
  const reserve = useMutation(api.bookings.create)
  const router = useRouter()
  const subscriptionStatus = useQuery(api.subscriptions.getStatus)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [selectedId, setSelectedId] = useState<Id<'trips'> | null>(null)
  const [reserveOpen, setReserveOpen] = useState(false)
  const [reserveTripId, setReserveTripId] = useState<Id<'trips'> | null>(null)
  // Local calendar dates — a UTC slice(0,10) near midnight pre-selects
  // yesterday for East African evening users.
  const [checkIn, setCheckIn] = useState(() => localDateOnly(new Date()))
  const [checkOut, setCheckOut] = useState(() => localDateOnly(new Date(Date.now() + 86400000)))
  const [guests, setGuests] = useState(2)
  const selectedTrip = useQuery(api.trips.getWithStops, selectedId ? { id: selectedId } : 'skip')
  // Shared viewer trips can't be edited, and only owned trips can take
  // reservations — keep them out of the pickers so users aren't misled.
  const editableTrips = (trips ?? []).filter(t => t.role !== 'viewer')
  const ownTrips = (trips ?? []).filter(t => t.role === 'owner')

  // The page itself is public — signing in is only required for the actions.
  // If a guest taps Reserve / Add to trip, run the action right after they
  // finish signing in.
  useEffect(() => {
    if (isSignedIn && pendingAction) {
      const action = pendingAction
      setPendingAction(null)
      action()
    }
  }, [isSignedIn, pendingAction])

  function gate(action: () => void) {
    if (!isSignedIn) {
      setPendingAction(() => action)
      clerk.openSignIn()
      return
    }
    action()
  }

  function handleAddToTrip() {
    gate(() => setPickerOpen(true))
  }

  // If the signed-in user's access has run out, show the paywall dialog
  // instead of the reserve form (the server also rejects the write). While
  // the status query is still loading we wait — treating "unknown" as "allowed"
  // used to open the form right before the server rejected it.
  function handleReserveClick() {
    gate(() => {
      if (subscriptionStatus === undefined) return
      if (subscriptionStatus === null || !subscriptionStatus.active) {
        setPaywallOpen(true)
        return
      }
      setReserveOpen(true)
    })
  }

  // Transport verticals book one-way (date + passengers) instead of the
  // stay-style check-in/check-out range.
  const isOneWayTransport = item?.vertical === 'taxis' || item?.vertical === 'flights'

  const [adding, setAdding] = useState(false)
  const [creatingTrip, setCreatingTrip] = useState(false)

  async function confirmAdd() {
    if (!item || !selectedId || !selectedTrip || adding) return
    if (!selectedTrip.stops) {
      toast.error('Trip data is still loading — try again')
      return
    }
    setAdding(true)
    try {
      // Full-fidelity payload — a subset here would wipe completedAt/reason/
      // locks/images off every existing stop (replaceStops is delete+insert).
      const existing = toReplaceStopsPayload(selectedTrip.stops)
      if (existing.some(s => s.listingId === item._id)) {
        toast.error('This place is already in that trip')
        setAdding(false)
        return
      }
      const newStop = { name: item.name, place: item.location, day: Math.max(...(existing.length ? existing.map(s => s.day) : [0]), 1), time: '09:00', cost: item.price, kind: stopKindFor(item.vertical), order: existing.length, lat: item.lat, lng: item.lng, verified: true, source: 'catalog' as const, listingId: item._id, vertical: item.vertical, unit: item.unit, image: item.image }
      await replaceStops({ tripId: selectedId, stops: [...existing, newStop] })
      toast.success(`Added to ${selectedTrip.name}`)
      setPickerOpen(false)
      router.push(`/trips/${selectedId}`)
    } catch {
      toast.error('Could not add this stop — try again')
    } finally {
      setAdding(false)
    }
  }

  async function createNewTrip() {
    if (!item || creatingTrip) return
    gate(async () => {
      setCreatingTrip(true)
      try {
        const id = await create({ name: item.name + ' Trip', destination: item.location, startDate: localDateOnly(new Date()), endDate: localDateOnly(new Date(Date.now() + 86400000)), budget: Math.max(item.price * 3, 50000), totalCost: item.price, stops: [{ name: item.name, place: item.location, day: 1, time: '09:00', cost: item.price, kind: stopKindFor(item.vertical), order: 0, lat: item.lat, lng: item.lng }] })
        toast.success('Trip created!')
        router.push(`/trips/${id}`)
        setPickerOpen(false)
      } catch {
        toast.error('Could not create this trip — your access may have expired')
      } finally {
        setCreatingTrip(false)
      }
    })
  }

  async function reserveThis() {
    if (!item) return
    try {
      const reference = await reserve({ listingId: item._id, type: item.vertical, amount: item.price, checkIn, checkOut, guests, tripId: reserveTripId ?? undefined })
      toast.success(`Reserved — ${reference}`, {
        action: { label: 'View bookings', onClick: () => router.push('/profile?tab=bookings') },
      })
      setReserveOpen(false)
    } catch {
      toast.error('Could not reserve this place')
    }
  }

  // Stable identities so the map isn't rebuilt on every dialog keystroke.
  // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
  const mapPoint = useMemo(() =>
    item?.lat != null && item?.lng != null
      ? [{ id: item._id, name: item.name, location: item.location, lat: item.lat, lng: item.lng }]
      : [],
    [item],
  )
  const mapHighlight = useMemo(() => (item?.lat != null ? [item._id] : []), [item])
  const mapFocus = useMemo(() =>
    item?.lat != null && item?.lng != null ? { lat: item.lat, lng: item.lng, zoom: 10 } : undefined,
    [item],
  )

  if (!validId) return <NotFound />
  // undefined = still loading (shimmer), null = well-formed id for a listing
  // that no longer exists (removed or rescraped away) — show 404, not a
  // half-empty ghost page with fallback hero and KSh 0.
  if (item === undefined) return <div className="kt-shimmer min-h-[100svh]" />
  if (!item) return <NotFound />

  return (
    <>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
        {/* Hero — one attractive picture with the essentials overlaid. */}
        <div className="relative overflow-hidden rounded-2xl shadow-lift ring-1 ring-border">
          <div className="relative h-64 md:h-80">
            <ListingImage src={item?.image || '/kenya-hero.png'} alt={item?.name || 'Listing'} fill priority className="object-cover" sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />
            <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
              <Badge className="bg-accent text-accent-foreground">{item?.vertical?.replace('-', ' ')?.toUpperCase()}</Badge>
              <SourceBadge source={item?.source} onClick={() => { const f = sourceToFilter(item?.source); if (f && item) router.push(`/discover/${item.vertical}?source=${f}`) }} />
            </div>
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-5 md:p-7">
              <div className="min-w-0">
                <h1 className="font-serif text-3xl font-semibold tracking-tight text-white md:text-4xl">{item?.name}</h1>
                <p className="mt-1 text-white/85"><MapPin className="mr-1 inline size-4 align-[-2px]" />{item?.location}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-bold text-foreground shadow-sm">
                  {formatKES(item?.price || 0)}
                  <span className="font-medium text-muted-foreground"> / {item?.unit}</span>
                </span>
                {item?.rating ? (
                  <span className="flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-sm font-semibold text-white backdrop-blur-sm">
                    <Star className="size-4 fill-amber-400 text-amber-400" />{item.rating.toFixed(1)}{item.reviews ? ` (${item.reviews})` : ''}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-7">
            {item?.description && (
              <section>
                <h2 className="font-serif text-2xl font-semibold tracking-tight">About this place</h2>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{item.description}</p>
              </section>
            )}

            {(item?.tags?.length || item?.freeCancellation || item?.instantConfirm) && (
              <section>
                <h2 className="font-serif text-2xl font-semibold tracking-tight">Good to know</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item?.tags?.map(tag => (
                    <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground">{tag}</span>
                  ))}
                  {item?.freeCancellation && (
                    <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground"><Check className="size-3.5 text-primary" />Free cancellation</span>
                  )}
                  {item?.instantConfirm && (
                    <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground"><Check className="size-3.5 text-primary" />Instant confirmation</span>
                  )}
                </div>
              </section>
            )}

            {mapPoint.length > 0 && (
              <section>
                <h2 className="font-serif text-2xl font-semibold tracking-tight">Where it is</h2>
                <KenyaMap
                  points={mapPoint}
                  highlight={mapHighlight}
                  focus={mapFocus}
                  className="mt-2 h-72"
                />
              </section>
            )}
          </div>

          {/* Sticky booking card */}
          <aside className="lg:sticky lg:top-20 lg:h-fit">
            <Card className="shadow-soft">
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-2xl font-bold">{formatKES(item?.price || 0)}</span>
                    <span className="text-sm text-muted-foreground"> / {item?.unit}</span>
                  </div>
                  {item?.rating ? (
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      <Star className="size-4 fill-accent text-accent" />{item.rating.toFixed(1)}
                    </span>
                  ) : null}
                </div>
                {savedEntry && item && savedEntry.priceAtSave != null && item.price < savedEntry.priceAtSave && (
                  <p className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                    <TrendingDown className="size-3.5 shrink-0" />
                    Price dropped {formatKES(savedEntry.priceAtSave)} → {formatKES(item.price)} since you saved it.
                  </p>
                )}
                <Button size="lg" className="w-full" onClick={handleReserveClick} disabled={!item || (isSignedIn && subscriptionStatus === undefined)}>
                  {isSignedIn && subscriptionStatus === undefined ? <Spinner label="Checking access" /> : 'Reserve'}
                </Button>
                <Button variant="outline" className="w-full" onClick={handleAddToTrip} disabled={!item}>
                  Add to a trip
                </Button>
                <Button variant="ghost" className="w-full" onClick={createNewTrip} disabled={!item || creatingTrip}>
                  {creatingTrip ? 'Creating…' : 'Start a new trip with this'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Free to reserve — pay later from your bookings.</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to trip</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={selectedId?.toString() || ''} onValueChange={v => setSelectedId(v as Id<'trips'> | null)}>
              <SelectTrigger><SelectValue placeholder="Select a trip" /></SelectTrigger>
              <SelectContent>{editableTrips.map(t => <SelectItem key={t._id} value={t._id}>{t.name}{t.role !== 'owner' ? ' · Shared' : ''}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="w-full" disabled={!selectedId || adding} onClick={confirmAdd}>{adding ? 'Adding…' : 'Add stop'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reserveOpen} onOpenChange={setReserveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request reservation</DialogTitle><DialogDescription>No payment now — pay later from your bookings.</DialogDescription></DialogHeader>
          <FieldGroup>
            <div className={cn('grid gap-4', isOneWayTransport ? 'grid-cols-1' : 'grid-cols-2')}>
              <Field><FieldLabel>{isOneWayTransport ? 'Pickup date' : 'Check-in'}</FieldLabel><Input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></Field>
              {!isOneWayTransport && <Field><FieldLabel>Check-out</FieldLabel><Input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></Field>}
            </div>
            <Field><FieldLabel>{isOneWayTransport ? 'Passengers' : 'Guests'}</FieldLabel><Input type="number" min={1} max={20} value={guests} onChange={e => setGuests(parseInt(e.target.value, 10) || 1)} /></Field>
            <Field>
              <FieldLabel>Link to trip (optional)</FieldLabel>
              <Select value={reserveTripId?.toString() || ''} onValueChange={v => setReserveTripId(v ? (v as Id<'trips'>) : null)}>
                <SelectTrigger><SelectValue placeholder="No trip — standalone request" /></SelectTrigger>
                <SelectContent>{ownTrips.map(t => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <Button className="w-full" onClick={reserveThis} disabled={!item}>Request reservation</Button>
        </DialogContent>
      </Dialog>

      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </>
  )
}
