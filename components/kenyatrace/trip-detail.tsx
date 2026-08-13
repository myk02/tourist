'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { SignInButton, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { CalendarClock, Camera, Copy, CopyPlus, LocateFixed, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { geocodeArea } from '@/lib/geocode'
import { formatKES } from '@/lib/kenya-data'
import { ItineraryEditor } from './itinerary-editor'
import { KenyaMap } from './kenya-map'
import { MomentAlbum } from './moment-album'
import { BudgetDashboard } from './budget-dashboard'
import { ForwardBookingDialog } from './forward-booking'
import { ShareTripDialog } from './share-trip'
import { BookingRow, BudgetBar, NotFound, useTripId } from './shared'
import { RequireSubscription } from './paywall'
import type { Stop } from './types'

export function TripDetail() {
  const id = useTripId()
  const router = useRouter()
  const params = useSearchParams()
  const inviteToken = params.get('invite')
  const { isSignedIn } = useUser()
  const trip = useQuery(api.trips.getWithStops, { id })
  const bookings = useQuery(api.bookings.forTrip, trip?.role === 'owner' ? { tripId: id } : 'skip')
  const remove = useMutation(api.trips.remove)
  const replaceStops = useMutation(api.trips.replaceStops)
  const updateTrip = useMutation(api.trips.update)
  const duplicateTrip = useMutation(api.trips.duplicate)
  const cancelBooking = useMutation(api.bookings.cancel)
  const acceptInvite = useMutation(api.trips.acceptInvite)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [inviteState, setInviteState] = useState<'idle' | 'accepting' | 'signin' | 'error'>('idle')

  // Accept a ?invite=token link: claim the role, then clean the URL so the
  // trip renders normally (and the token stops being shared around).
  useEffect(() => {
    if (!inviteToken) { setInviteState('idle'); return }
    if (!isSignedIn) { setInviteState('signin'); return }
    let cancelled = false
    setInviteState('accepting')
    acceptInvite({ token: inviteToken })
      .then(res => {
        if (cancelled) return
        toast.success(res.status === 'owner' ? 'This is your trip' : res.status === 'already' ? 'You are already on this trip' : `You joined as ${res.role}`)
        setInviteState('idle')
        const url = new URL(window.location.href)
        url.searchParams.delete('invite')
        router.replace(url.pathname + url.search, { scroll: false })
      })
      .catch(() => {
        if (cancelled) return
        setInviteState('error')
      })
    return () => { cancelled = true }
  }, [inviteToken, isSignedIn, acceptInvite, router])

  // Resolve the saved origin label (e.g. "Westlands, Nairobi") to coordinates
  // so the route map can show the trip's starting point with a pulsing marker.
  const [originPoint, setOriginPoint] = useState<{ id: string; name: string; location: string; lat: number; lng: number } | null>(null)
  useEffect(() => {
    const originLabel = trip?.origin
    if (!originLabel || originLabel.trim().length < 2) {
      setOriginPoint(null)
      return
    }
    let cancelled = false
    geocodeArea(originLabel).then(coords => {
      if (cancelled || !coords) return
      setOriginPoint({ id: 'origin', name: originLabel, location: 'Starting point', lat: coords.lat, lng: coords.lng })
    })
    return () => { cancelled = true }
  }, [trip?.origin])

  // Stable identities so the route map isn't torn down on every re-render.
  const route = useMemo(() => (trip?.stops ?? []).filter(s => s.lat != null && s.lng != null).map(s => [s.lng!, s.lat!] as [number, number]), [trip])
  const mapPoints = useMemo(() => (trip?.stops ?? []).filter(s => s.lat != null && s.lng != null).map(s => ({ id: s._id, name: s.name, location: s.place, lat: s.lat!, lng: s.lng! })), [trip])
  const routeMapPoints = useMemo(() => [...(originPoint ? [originPoint] : []), ...mapPoints], [originPoint, mapPoints])
  const routeHighlight = useMemo(() => (originPoint ? ['origin'] : []), [originPoint])
  const routeDestIds = useMemo(() => (mapPoints.length ? [mapPoints[mapPoints.length - 1].id] : []), [mapPoints])

  if (trip === undefined) return <div className="mx-auto max-w-6xl p-8"><div className="h-72 animate-pulse rounded-lg bg-secondary" /></div>
  if (!trip) {
    if (inviteState === 'accepting') return <div className="mx-auto max-w-6xl p-8"><div className="h-72 animate-pulse rounded-lg bg-secondary" /></div>
    if (inviteState === 'signin') {
      return (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-5 py-24 text-center">
          <span className="flex size-16 items-center justify-center rounded-lg bg-secondary text-primary"><Copy /></span>
          <h1 className="font-serif text-4xl tracking-tight">You're invited to a trip</h1>
          <p className="text-muted-foreground">Sign in to join this shared itinerary.</p>
          <SignInButton mode="modal"><Button size="lg">Sign in to join</Button></SignInButton>
        </div>
      )
    }
    if (inviteState === 'error') {
      return (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-5 py-24 text-center">
          <span className="flex size-16 items-center justify-center rounded-lg bg-secondary text-primary"><Trash2 /></span>
          <h1 className="font-serif text-4xl tracking-tight">Invite link expired</h1>
          <p className="text-muted-foreground">This invite link is no longer valid — ask the trip owner for a fresh one.</p>
          <Button nativeButton={false} render={<Link href="/trips" />}>Back to trips</Button>
        </div>
      )
    }
    return <NotFound />
  }

  const myRole = trip.role ?? 'owner'
  const isOwner = myRole === 'owner'
  const canEdit = myRole !== 'viewer'
  // The owner's subscription gates their trip space; invited collaborators
  // ride on the owner's access so sharing stays frictionless.
  const requireSubscription = isOwner

  const NEXT_STATUS: Record<string, { status: string; label: string }> = {
    planning: { status: 'booked', label: 'Mark as booked' },
    booked: { status: 'travelling', label: 'Start travelling' },
    travelling: { status: 'completed', label: 'Mark complete' },
  }
  const nextStatus = NEXT_STATUS[trip.status]

  async function handleNextStatus() {
    if (!nextStatus) return
    setUpdating(true)
    try {
      await updateTrip({ id, patch: { status: nextStatus.status } })
      toast.success(`Trip marked as ${nextStatus.status}`)
    } catch {
      toast.error('Could not update trip status')
    } finally {
      setUpdating(false)
    }
  }

  async function handleDuplicate() {
    try {
      const newId = await duplicateTrip({ id })
      toast.success('Trip duplicated')
      router.push(`/trips/${newId}`)
    } catch {
      toast.error('Could not duplicate this trip')
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/trips/${id}`)
      toast.success('Trip link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  async function handleRemove() {
    try {
      await remove({ id })
      toast.success('Trip deleted')
      router.push('/trips')
    } catch {
      toast.error('Could not delete this trip')
    }
  }

  async function handleCancelBooking(bookingId: Id<'bookings'>) {
    try {
      await cancelBooking({ id: bookingId })
      toast.success('Reservation cancelled')
    } catch {
      toast.error('Could not cancel this reservation')
    }
  }

  async function handleSave(stops: Stop[]) {
    try {
      await replaceStops({
        tripId: id,
        stops: stops.map((s, i) => ({
          name: s.title,
          place: s.place,
          day: s.day,
          time: s.time,
          cost: s.cost,
          kind: s.kind,
          order: i,
          lat: s.lat,
          lng: s.lng,
          locked: s.locked,
          reason: s.reason,
          verified: s.verified,
          duration: s.duration,
        })),
      })
      toast.success('Itinerary saved')
    } catch {
      toast.error('Could not save changes')
    }
  }

  const stops = trip.stops.map(s => ({ day: s.day, time: s.time, title: s.name, place: s.place, cost: s.cost, kind: s.kind, lat: s.lat, lng: s.lng, locked: s.locked, reason: s.reason, verified: s.verified, duration: s.duration }))
  const activeBookings = (bookings ?? []).filter(b => b.status !== 'cancelled')
  const bookingsTotal = activeBookings.reduce((sum, b) => sum + b.amount, 0)
  return (
    <RequireSubscription enabled={requireSubscription}>
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-8">
      <div className="overflow-hidden rounded-lg bg-primary px-6 py-10 text-primary-foreground md:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-accent text-accent-foreground">{trip.startDate} — {trip.endDate}</Badge>
          {!isOwner && <Badge className="bg-accent text-accent-foreground">{myRole === 'editor' ? 'Shared with you · Editor' : 'Shared with you · Viewer'}</Badge>}
        </div>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="mt-2 opacity-80">{trip.destination}</p>
        {isOwner && bookings !== undefined && activeBookings.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium opacity-90">
            <CalendarClock className="size-4" />
            {activeBookings.length} active reservation{activeBookings.length === 1 ? '' : 's'} · {formatKES(bookingsTotal)}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {isOwner && <Button variant="secondary" nativeButton={false} render={<Link href={`/trips/${trip._id}/track`} />}><LocateFixed data-icon="inline-start" />Start live tracking</Button>}
          {isOwner && <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" nativeButton={false} render={<Link href={`/moments?trip=${trip._id}`} />}><Camera data-icon="inline-start" />Moments</Button>}
          {myRole !== 'viewer' && <ShareTripDialog tripId={id} tripName={trip.name} myRole={myRole} isOwner={isOwner} triggerClassName="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" />}
          {canEdit && nextStatus && <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" onClick={handleNextStatus} disabled={updating}>{nextStatus.label}</Button>}
          {canEdit && <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" onClick={handleDuplicate}><CopyPlus data-icon="inline-start" />Duplicate</Button>}
          <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" onClick={handleCopyLink}><Copy data-icon="inline-start" />Copy link</Button>
          {isOwner && <Button variant="outline" className="border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmOpen(true)}><Trash2 data-icon="inline-start" />Delete trip</Button>}
        </div>
      </div>
      <BudgetBar stops={stops} budget={trip.budget} />
      <Tabs defaultValue="itinerary">
        <TabsList>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="route">Route map</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          {isOwner && <TabsTrigger value="bookings">Bookings</TabsTrigger>}
          {isOwner && <TabsTrigger value="moments">Moments</TabsTrigger>}
        </TabsList>
        <TabsContent value="itinerary">
          <ItineraryEditor initial={stops} budget={trip.budget} title={trip.name} defaultMobileView={route.length > 0 ? 'map' : 'list'} onSave={canEdit ? handleSave : undefined} readOnly={!canEdit} />
        </TabsContent>
        <TabsContent value="route"><KenyaMap points={routeMapPoints} highlight={routeHighlight} route={route} destIds={routeDestIds} /></TabsContent>
        <TabsContent value="budget"><BudgetDashboard stops={stops} budget={trip.budget} totalCost={trip.totalCost} /></TabsContent>
        {isOwner && (
          <TabsContent value="bookings">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Reservations linked to this trip</p>
                <ForwardBookingDialog tripId={id} />
              </div>
              {bookings === undefined ? (
                <div className="h-28 animate-pulse rounded-lg bg-secondary" />
              ) : bookings.length > 0 ? (
                bookings.map(b => <BookingRow key={b._id} booking={b} onCancel={handleCancelBooking} />)
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                  <CalendarClock className="size-8 text-primary" />
                  <p className="mt-4 font-serif text-2xl">No reservations for this trip</p>
                  <p className="mt-2 max-w-md text-muted-foreground">When you request a reservation from a place page and link it to this trip, it will appear here — or use “Forward a confirmation” above to add one from a booking email.</p>
                  <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href="/discover" />}>Explore places</Button>
                </div>
              )}
            </div>
          </TabsContent>
        )}
        {isOwner && <TabsContent value="moments"><MomentAlbum tripId={id} /></TabsContent>}
      </Tabs>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this trip?</DialogTitle><DialogDescription>This removes the trip and its stops permanently. This can't be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleRemove}>Delete trip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </RequireSubscription>
  )
}
