'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { SignInButton, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { CalendarClock, Camera, Copy, CopyPlus, FileDown, Images, LocateFixed, Map, MoreHorizontal, Printer, Route, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GradientHero } from '@/components/ui/kt/gradient-hero'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { geocodeArea } from '@/lib/geocode'
import { buildPrintableItinerary, type PrintableItinerary } from '@/lib/itinerary'
import { downloadItineraryImage } from '@/lib/itinerary-image'
import { formatKES } from '@/lib/kenya-data'
import { localDateOnly, prettyDate } from '@/lib/dates'
import { ItineraryEditor } from './itinerary-editor'
import { KenyaMap } from './kenya-map'
import { MomentAlbum } from './moment-album'
import { BudgetDashboard } from './budget-dashboard'
import { ForwardBookingDialog } from './forward-booking'
import { ShareTripDialog } from './share-trip'
import { BookingRow, BudgetBar, NotFound, useTripId } from './shared'
import { RequireSubscription } from './paywall'
import { TripBriefCard } from './trip-brief'
import { TripChecklist } from './trip-checklist'
import { TodayCard } from './today-card'
import type { Stop } from './types'

// ─── Trip stage: the hub reorders itself around where the traveller is ──────

type TripStage = 'planning' | 'active' | 'past'

const DAY_MS = 86_400_000

/**
 * Stage comes from the dates when they exist (a trip is "past" the day after
 * its end date, "active" within its window) and falls back to the manual
 * status for dateless trips.
 */
function deriveStage(status?: string, startDate?: string, endDate?: string): TripStage {
  if (status === 'completed') return 'past'
  const iso = /^\d{4}-\d{2}-\d{2}$/
  const today = localDateOnly(new Date())
  if (startDate && endDate && iso.test(startDate) && iso.test(endDate)) {
    if (today > endDate) return 'past'
    if (today >= startDate) return 'active'
  } else if (status === 'travelling') {
    return 'active'
  }
  return 'planning'
}

export function TripDetail() {
  const id = useTripId()
  const router = useRouter()
  const params = useSearchParams()
  const inviteToken = params.get('invite')
  const { isSignedIn } = useUser()
  const trip = useQuery(api.trips.getWithStops, id ? { id } : 'skip')
  const bookings = useQuery(api.bookings.forTrip, id && trip?.role === 'owner' ? { tripId: id } : 'skip')
  const remove = useMutation(api.trips.remove)
  const replaceStops = useMutation(api.trips.replaceStops)
  const updateTrip = useMutation(api.trips.update)
  const duplicateTrip = useMutation(api.trips.duplicate)
  const cancelBooking = useMutation(api.bookings.cancel)
  const acceptInvite = useMutation(api.trips.acceptInvite)
  const enableTraceShare = useMutation(api.trips.enableTraceShare)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
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

  // A malformed /trips/<garbage> route must show NotFound, not crash Convex.
  // Narrowed alias: TS won't narrow the union inside hoisted function
  // declarations, so handlers and JSX below use the guaranteed non-null id.
  if (id == null) return <NotFound />
  const tripId = id
  if (trip === undefined) return <div className="mx-auto max-w-6xl p-8"><div className="kt-shimmer h-72 rounded-2xl" /></div>
  if (!trip) {
    if (inviteState === 'accepting') return <div className="mx-auto max-w-6xl p-8"><div className="kt-shimmer h-72 rounded-2xl" /></div>
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

  const stage = deriveStage(trip.status, trip.startDate, trip.endDate)

  // Status chip: a countdown before, "Day X of Y" on the road, done after.
  let stageChip: string
  if (stage === 'past') {
    stageChip = 'Completed'
  } else if (stage === 'active') {
    const start = Date.parse(trip.startDate ?? '')
    const end = Date.parse(trip.endDate ?? '')
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      const total = Math.round((end - start) / DAY_MS) + 1
      const dayN = Math.min(Math.max(Math.round((Date.parse(localDateOnly(new Date())) - start) / DAY_MS) + 1, 1), total)
      stageChip = `Day ${dayN} of ${total}`
    } else {
      stageChip = 'On the road'
    }
  } else if (trip.startDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.startDate)) {
    const daysTo = Math.round((Date.parse(trip.startDate) - Date.parse(localDateOnly(new Date()))) / DAY_MS)
    stageChip = daysTo <= 0 ? 'Starts today' : daysTo === 1 ? 'Starts tomorrow' : `Starts in ${daysTo} days`
  } else {
    stageChip = 'Planning'
  }

  // Tabs persist in the URL so back-navigation and shared links land on the
  // same view; past trips open on Moments for the owner.
  const TAB_IDS = ['itinerary', 'route', 'budget', 'bookings', 'moments']
  const defaultTab = stage === 'past' && isOwner ? 'moments' : 'itinerary'
  const requestedTab = params.get('tab')
  const activeTab = requestedTab != null && TAB_IDS.includes(requestedTab) ? requestedTab : defaultTab
  // Bookings and Moments are owner-only tabs — a viewer's deep link falls back.
  const tab = !isOwner && (activeTab === 'bookings' || activeTab === 'moments') ? defaultTab : activeTab

  function selectTab(value: string) {
    router.replace(`/trips/${tripId}?tab=${encodeURIComponent(value)}`, { scroll: false })
  }

  // One primary action, chosen by stage: plan → refine, active → go live,
  // past → relive. Everything else lives in the More menu.
  const primaryAction = (() => {
    if (stage === 'active' && isOwner) {
      return (
        <Button variant="secondary" nativeButton={false} render={<Link href={`/trips/${trip._id}/track`} />}>
          <LocateFixed data-icon="inline-start" />Go live
        </Button>
      )
    }
    if (stage === 'past') {
      const token = (trip as { traceShareToken?: string }).traceShareToken
      return (
        <Button variant="secondary" nativeButton={false} render={<Link href={token ? `/recap/${trip._id}?t=${token}` : `/recap/${trip._id}`} />}>
          <Images data-icon="inline-start" />View recap
        </Button>
      )
    }
    if (canEdit) {
      return (
        <Button variant="secondary" nativeButton={false} render={<Link href={`/trips/${trip._id}?tab=itinerary`} />}>
          <Map data-icon="inline-start" />Edit itinerary
        </Button>
      )
    }
    return null
  })()

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
      await updateTrip({ id: tripId, patch: { status: nextStatus.status } })
      toast.success(`Trip marked as ${nextStatus.status}`)
    } catch {
      toast.error('Could not update trip status')
    } finally {
      setUpdating(false)
    }
  }

  async function handleDuplicate() {
    try {
      const newId = await duplicateTrip({ id: tripId })
      toast.success('Trip duplicated')
      router.push(`/trips/${newId}`)
    } catch {
      toast.error('Could not duplicate this trip')
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/trips/${tripId}`)
      toast.success('Trip link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  // The shared data shape for both exports (print/PDF and image).
  function printableData(): PrintableItinerary {
    if (!trip) throw new Error('Trip not loaded')
    return {
      name: trip.name,
      destination: trip.destination,
      origin: trip.origin,
      startDate: trip.startDate,
      endDate: trip.endDate,
      budget: trip.budget,
      totalCost: trip.totalCost,
      stops: trip.stops.map(s => ({
        day: s.day, time: s.time, name: s.name, place: s.place, kind: s.kind,
        cost: s.cost, verified: s.verified, travelKm: s.travelKm, travelMins: s.travelMins,
      })),
    }
  }

  // Opens the itinerary as a clean, self-contained document for printing or
  // saving as a PDF — an offline copy for the road.
  function handlePrint() {
    let doc: string
    try {
      doc = buildPrintableItinerary(printableData())
    } catch {
      return
    }
    const win = window.open('', '_blank', 'width=860,height=1000')
    if (!win) { toast.error('Pop-up blocked — allow pop-ups to print'); return }
    win.document.write(doc)
    win.document.close()
    setTimeout(() => win.print(), 350)
  }

  // Renders the plan as a share-ready PNG (WhatsApp-sized).
  async function handleDownloadImage() {
    try {
      await downloadItineraryImage(printableData())
      toast.success('Itinerary image downloaded')
    } catch {
      toast.error('Could not create the image')
    }
  }

  // Publishes the trip's live trace as a public, shareable page (the trace
  // token is the password — created on demand for trips that predate tokens).
  async function handleShareTrace() {
    try {
      const { token } = await enableTraceShare({ tripId })
      await navigator.clipboard.writeText(`${window.location.origin}/trace/${tripId}?t=${token}`)
      toast.success('Trace link copied — anyone with it can see your route')
    } catch {
      toast.error('Could not share this trace')
    }
  }

  async function handleRemove() {
    try {
      await remove({ id: tripId })
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
    const completionByKey = Object.fromEntries(
      trip!.stops.map(s => [`${s.day}|${s.reason ?? s.name}`, s.completedAt]),
    )
    try {
      await replaceStops({
        tripId,
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
          source: s.source,
          listingId: s.listingId,
          vertical: s.vertical,
          unit: s.unit,
          image: s.image,
          travelKm: s.travelKm,
          travelMins: s.travelMins,
          travelRouted: s.travelRouted,
          completedAt: s.completedAt ?? completionByKey[`${s.day}|${s.reason ?? s.title}`],
        })),
      })
      toast.success('Itinerary saved')
    } catch {
      toast.error('Could not save changes')
    }
  }

  const stops = trip.stops.map(s => ({ day: s.day, time: s.time, title: s.name, place: s.place, cost: s.cost, kind: s.kind, lat: s.lat, lng: s.lng, locked: s.locked, reason: s.reason, verified: s.verified, duration: s.duration, source: s.source as 'catalog' | 'gap' | undefined, listingId: s.listingId, vertical: s.vertical, unit: s.unit, image: s.image, travelKm: s.travelKm, travelMins: s.travelMins, travelRouted: s.travelRouted, completedAt: s.completedAt }))
  const activeBookings = (bookings ?? []).filter(b => b.status !== 'cancelled')
  const bookingsTotal = activeBookings.reduce((sum, b) => sum + b.amount, 0)
  return (
    <RequireSubscription enabled={requireSubscription}>
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-8">
      <GradientHero className="px-6 py-10 md:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-accent text-accent-foreground">{prettyDate(trip.startDate)} — {prettyDate(trip.endDate)}</Badge>
          <Badge className="bg-primary-foreground/20 text-primary-foreground">{stageChip}</Badge>
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
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {primaryAction}
          {canEdit && nextStatus && (
            <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" onClick={handleNextStatus} disabled={updating}>{nextStatus.label}</Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" aria-label="More trip actions">
                  <MoreHorizontal data-icon="inline-start" />More
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-56">
              {isOwner && (
                <DropdownMenuItem render={<Link href={`/trips/${tripId}/track`} />}>
                  <LocateFixed />Live tracking
                </DropdownMenuItem>
              )}
              {isOwner && (
                <DropdownMenuItem render={<Link href={`/moments?trip=${trip._id}`} />}>
                  <Camera />Moments
                </DropdownMenuItem>
              )}
              {myRole !== 'viewer' && (
                <DropdownMenuItem onClick={() => setShareOpen(true)}>
                  <Users />Invite &amp; share
                </DropdownMenuItem>
              )}
              {isOwner && (
                <DropdownMenuItem onClick={() => void handleShareTrace()}>
                  <Route />Share trace link
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={() => void handleDuplicate()}>
                  <CopyPlus />Duplicate
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleCopyLink}>
                <Copy />Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDownloadImage()}>
                <FileDown />Download image
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint}>
                <Printer />Print / PDF
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                    <Trash2 />Delete trip
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </GradientHero>
      {stage === 'active' && (
        <TodayCard
          tripId={tripId}
          startDate={trip.startDate}
          stops={trip.stops}
          editable={canEdit}
          isOwner={isOwner}
        />
      )}
      {stage === 'active' && trip.stops.length > 0 && trip.stops.every(s => s.completedAt) && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Images className="size-4 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-sm font-medium">Every stop checked off — your trace is ready to relive.</p>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/recap/${tripId}`} />}>View recap</Button>
          </CardContent>
        </Card>
      )}
      {stage !== 'active' && trip.stops.length > 0 && (
        <Card>
          <CardContent className="max-h-96 overflow-y-auto p-5">
            {/* Group layer lives here during planning: thumbs + day notes for
                editors/owners, read-only for viewers. */}
            <TripChecklist tripId={tripId} stops={trip.stops} editable={canEdit} collab isOwner={isOwner} />
          </CardContent>
        </Card>
      )}
      {isOwner && (
        <TripBriefCard
          tripId={tripId}
          aiBrief={trip.aiBrief}
          stops={trip.stops}
          origin={trip.origin}
          destination={trip.destination}
          startDate={trip.startDate}
          travelMonth={trip.travelMonth}
          doneCount={trip.stops.filter(s => s.completedAt).length}
          editable={isOwner}
        />
      )}
      <BudgetBar stops={stops} budget={trip.budget} />
      <Tabs value={tab} onValueChange={value => selectTab(String(value))}>
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
        <TabsContent value="budget"><BudgetDashboard stops={stops} budget={trip.budget} totalCost={trip.totalCost} tripId={tripId} initialTravelers={trip.travelers} canEdit={canEdit} /></TabsContent>
        {isOwner && (
          <TabsContent value="bookings">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Reservations linked to this trip</p>
                <ForwardBookingDialog tripId={tripId} />
              </div>
              {bookings !== undefined && (() => {
                const unpaid = bookings.filter(b => b.status !== 'paid' && b.status !== 'cancelled' && b.amount > 0)
                const unpaidTotal = unpaid.reduce((s, b) => s + b.amount, 0)
                return unpaid.length > 0 ? (
                  <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                    <strong>{formatKES(unpaidTotal)}</strong> outstanding across {unpaid.length} reservation{unpaid.length === 1 ? '' : 's'} — pay below to lock {unpaid.length === 1 ? 'it' : 'them'} in.
                  </p>
                ) : null
              })()}
              {bookings === undefined ? (
                <div className="kt-shimmer h-28 rounded-xl" />
              ) : bookings.length > 0 ? (
                bookings.map(b => <BookingRow key={b._id} booking={b} onCancel={handleCancelBooking} />)
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
                  <CalendarClock className="size-8 text-primary" />
                  <p className="mt-4 font-serif text-2xl">No reservations for this trip</p>
                  <p className="mt-2 max-w-md text-muted-foreground">When you request a reservation from a place page and link it to this trip, it will appear here — or use “Forward a confirmation” above to add one from a booking email.</p>
                  <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href="/discover" />}>Explore places</Button>
                </div>
              )}
            </div>
          </TabsContent>
        )}
        {isOwner && <TabsContent value="moments"><MomentAlbum tripId={tripId} /></TabsContent>}
      </Tabs>
      {myRole !== 'viewer' && (
        <ShareTripDialog tripId={tripId} tripName={trip.name} myRole={myRole} isOwner={isOwner} open={shareOpen} onOpenChange={setShareOpen} />
      )}
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
