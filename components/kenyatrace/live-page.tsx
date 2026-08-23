'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Compass, Images, ListChecks, MapPin, Navigation, Route, Share2, ShieldOff, Square, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { geocodeArea } from '@/lib/geocode'
import { localDateOnly, timeAgo } from '@/lib/dates'
import { readCache, writeCache, type CacheEntry } from '@/lib/offline-cache'
import { cn } from '@/lib/utils'
import { KenyaMap } from './kenya-map'
import { NotFound, useTripId } from './shared'
import { useTracking } from './tracking-provider'
import { TripChecklist } from './trip-checklist'
import { RequireSubscription } from './paywall'

/** Seconds after which a missing GPS fix starts to look like a stall. */
const STALE_AFTER_MS = 45000

type TripWithStops = NonNullable<ReturnType<typeof useQuery<typeof api.trips.getWithStops>>>

interface TrackSnapshot {
  trip: TripWithStops | null
  recorded: { lat: number; lng: number }[]
  consent: boolean
}

export function Track() {
  const id = useTripId()
  const trip = useQuery(api.trips.getWithStops, id ? { id } : 'skip')
  const me = useQuery(api.users.me)
  const recorded = useQuery(api.positions.forTrip, id ? { tripId: id, maxPoints: 2000 } : 'skip')
  const setConsent = useMutation(api.users.setTrackingConsent)
  const enableTraceShare = useMutation(api.trips.enableTraceShare)
  const { session, start, stop } = useTracking()
  const [checklistOpen, setChecklistOpen] = useState(false)
  // Optimistic consent: the server value arrives async, so the switch flips
  // immediately and reverts only if the mutation fails — no more "dead" toggle.
  const [localConsent, setLocalConsent] = useState(false)
  // Ticks while a session is active so staleness stays current even when no
  // new fixes arrive.
  const [, setTick] = useState(0)

  // Offline-lite: keep the last loaded trip + recorded trail on this device.
  // When Convex can't be reached (dead zone), the page renders the saved copy
  // behind an honest "synced X ago" chip instead of a forever-shimmer.
  const [cached, setCached] = useState<CacheEntry<TrackSnapshot> | null>(null)
  useEffect(() => {
    if (id) setCached(readCache(`kt-track-${id}`))
  }, [id])
  useEffect(() => {
    if (!id || trip == null || recorded === undefined) return
    writeCache(`kt-track-${id}`, { trip, recorded, consent: me?.trackingConsent === true } satisfies TrackSnapshot)
  }, [id, trip, recorded, me?.trackingConsent])

  // Saved-copy views: real data when connected, cached when not. Online this
  // doubles as instant paint (stale-while-revalidate) — the query swaps in
  // fresh values as soon as they arrive.
  const usingCache = trip === undefined && !!cached
  const viewTrip = trip ?? cached?.value.trip ?? undefined
  const viewRecorded = recorded ?? cached?.value.recorded ?? undefined
  const viewConsent = me?.trackingConsent === true || localConsent || (usingCache && !!cached?.value.consent)

  // Resolve the saved origin label to coordinates so the map can show the
  // trip's starting point (lat 0 is the equator — null-check, not truthiness).
  const [originPoint, setOriginPoint] = useState<{ id: string; name: string; location: string; lat: number; lng: number } | null>(null)
  useEffect(() => {
    const originLabel = viewTrip?.origin
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
  }, [viewTrip?.origin])

  const route = useMemo(() => (viewTrip?.stops ?? []).filter(s => s.lat != null && s.lng != null).map(s => [s.lng!, s.lat!] as [number, number]), [viewTrip])
  const mapPoints = useMemo(() => (viewTrip?.stops ?? []).filter(s => s.lat != null && s.lng != null).map(s => ({ id: s._id, name: s.name, location: s.place, lat: s.lat!, lng: s.lng! })), [viewTrip])
  const trackPoints = useMemo(() => [...(originPoint ? [originPoint] : []), ...mapPoints], [originPoint, mapPoints])
  const trackHighlight = useMemo(() => (originPoint ? ['origin'] : []), [originPoint])
  const trackDestIds = useMemo(() => (mapPoints.length ? [mapPoints[mapPoints.length - 1].id] : []), [mapPoints])

  const consent = viewConsent
  const active = session && session.tripId === id ? session : null
  const tracking = active?.status === 'tracking'
  const arrived = active?.status === 'arrived'

  // Staleness: recompute every 10s while tracking so a stalled GPS shows up.
  useEffect(() => {
    if (!tracking) return
    const t = setInterval(() => setTick(x => x + 1), 10000)
    return () => clearInterval(t)
  }, [tracking])
  const staleForMs = tracking && active?.lastFixAt ? Date.now() - active.lastFixAt : 0

  const destinationStop = viewTrip?.stops.filter(s => s.lat != null && s.lng != null).slice(-1)[0]
  const dest = destinationStop ? { name: destinationStop.name, lat: destinationStop.lat!, lng: destinationStop.lng! } : null

  const recordedPath = useMemo(() => viewRecorded?.map(p => [p.lng, p.lat] as [number, number]) || [], [viewRecorded])
  // The DB trail already includes every point persisted during the current
  // session (record() writes as we move), so appending the full session path
  // would redraw the whole route and "jump back" to session start. Draw the
  // persisted trail plus just the latest live fix as a short tail.
  const trace = useMemo(() => {
    const hasDb = recordedPath.length >= 2
    if (!active) return hasDb ? recordedPath : []
    if (!hasDb) return active.path.length >= 2 ? active.path : []
    const live = active.lastPoint ? [[active.lastPoint.lng, active.lastPoint.lat] as [number, number]] : []
    return [...recordedPath, ...live]
  }, [recordedPath, active])

  function handleStart() {
    if (!dest) { toast.error('This trip has no destination coordinates'); return }
    start({
      tripId,
      tripName: viewTrip?.name ?? 'Trip',
      destinationName: viewTrip?.destination || dest.name,
      destLat: dest.lat,
      destLng: dest.lng,
      originLabel: viewTrip?.origin,
    })
    toast.success('Live tracking started')
  }

  function handleStop() {
    stop()
    toast.success('Tracking stopped')
  }

  // Consent is enforced server-side on every record() — turning it off here
  // ends persistence immediately, wherever the user is in the app.
  function handleRevokeConsent() {
    setLocalConsent(false)
    setConsent({ consent: false })
      .then(() => toast.success('Location tracing turned off'))
      .catch(() => toast.error('Could not update location consent'))
  }

  async function handleShareTrace() {
    try {
      const { token } = await enableTraceShare({ tripId })
      await navigator.clipboard.writeText(`${window.location.origin}/trace/${tripId}?t=${token}`)
      toast.success('Trace link copied — anyone with it can see your route')
    } catch {
      toast.error('Could not share this trace')
    }
  }

  // Narrowed alias: TS won't narrow the union inside hoisted function
  // declarations, so handlers and JSX below use the guaranteed non-null id.
  if (id == null) return <NotFound />
  const tripId = id
  // A definitive "no such trip" from the server wins over any saved copy.
  if (me !== undefined && trip === null) return <NotFound />
  // Offline with a saved copy renders through; otherwise wait for data.
  if (viewTrip === undefined || (me === undefined && !usingCache)) return <div className="kt-shimmer min-h-screen" />
  if (!viewTrip) return <NotFound />
  const isViewer = viewTrip.role === 'viewer'

  return (
    <RequireSubscription>
      <div className="relative min-h-[calc(100vh-4rem)]">
        <KenyaMap
          points={trackPoints}
          highlight={trackHighlight}
          destIds={trackDestIds}
          route={route}
          live={active?.lastPoint ?? null}
          livePath={trace.length >= 2 ? trace : undefined}
          followLive={tracking}
          className="h-[calc(100vh-4rem)] rounded-none"
        />
        {usingCache && (
          <div className="absolute left-4 top-4 z-[600] flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-100/95 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm dark:bg-amber-500/90 dark:text-amber-950">
            <WifiOff className="size-3.5" />
            Saved copy · synced {cached ? timeAgo(cached.at) : 'earlier'}
          </div>
        )}
        <Card className="absolute bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2">
          <CardContent className="p-4">
            {/* Viewers can watch the trace but never start it — positions.record
                rejects non-owners server-side, so offering Start just misleads. */}
            {isViewer ? (
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Navigation /></span>
                <div className="flex-1">
                  <p className="font-semibold">Live route for this trip</p>
                  <p className="text-sm text-muted-foreground">Only the trip owner records this route — you&apos;re watching it live{viewRecorded?.length ? ` · ${viewRecorded.length} points so far` : ''}.</p>
                </div>
              </div>
            ) : !consent ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),#000_25%)] text-primary-foreground shadow-xs"><MapPin /></span>
                  <div className="flex-1">
                    <p className="font-semibold">Share your live location?</p>
                    <p className="text-sm text-muted-foreground">We record your route to build a trace of your trip. Only you can see it, and you can turn it off anytime.</p>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border p-3">
                  <span className="text-sm font-medium">Allow location tracing for this trip</span>
                  <Switch
                    checked={localConsent}
                    onCheckedChange={v => {
                      setLocalConsent(v)
                      setConsent({ consent: v })
                        .then(() => { if (v) toast.success('Location tracing enabled') })
                        .catch(() => { setLocalConsent(false); toast.error('Could not update location consent') })
                    }}
                  />
                </label>
              </div>
            ) : arrived ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs"><Navigation /></span>
                  <div className="flex-1">
                    <p className="font-semibold">You&apos;ve arrived at {viewTrip.destination}</p>
                    <p className="text-sm text-muted-foreground">Live tracking detected your arrival — 100% of the way there.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!isViewer && <Button variant="outline" className="gap-2" onClick={() => void handleShareTrace()}><Route className="size-4" />Share trace</Button>}
                  {!isViewer && <Button variant="outline" className="gap-2" nativeButton={false} render={<a href={`/moments?trip=${tripId}`} />}><Share2 className="size-4" />Share your experience</Button>}
                  <Button variant="outline" className="gap-2" nativeButton={false} render={<a href={`/recap/${tripId}`} />}><Images className="size-4" />View recap</Button>
                  <Button variant="outline" nativeButton={false} render={<a href={`/trips/${tripId}`} />}>View trip</Button>
                  <Button variant="ghost" className="gap-2" nativeButton={false} render={<a href="/discover" />}><Compass className="size-4" />Explore more</Button>
                </div>
              </div>
            ) : active ? (
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 animate-pulse items-center justify-center rounded-xl bg-red-500 text-white shadow-xs"><Square className="size-4" /></span>
                <div className="flex-1">
                  <p className="font-semibold">Live tracking in progress</p>
                  <p className="text-sm text-muted-foreground">
                    {active.distanceKm != null
                      ? `${active.distanceKm.toFixed(1)} km to ${viewTrip.destination} · ${active.path.length} point${active.path.length === 1 ? '' : 's'} recorded`
                      : `${active.path.length} point${active.path.length === 1 ? '' : 's'} recorded`}
                  </p>
                  <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${active.progressPct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{active.progressPct}% of the way there</p>
                  {staleForMs > STALE_AFTER_MS && (
                    <p className="mt-1.5 w-fit rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                      Weak GPS signal — last fix {Math.round(staleForMs / 60000)} min ago
                    </p>
                  )}
                </div>
                <Button variant="destructive" onClick={handleStop}>End</Button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs"><Navigation /></span>
                <div className="flex-1">
                  <p className="font-semibold">Ready to trace your journey?</p>
                  <p className="text-sm text-muted-foreground">
                    Only you can see this trip location{recordedPath.length ? ` · ${recordedPath.length} points saved earlier` : ''}. Your route saves every few seconds while you move — only while this page or its widget stays open.
                  </p>
                </div>
                <Button onClick={handleStart}>Start</Button>
              </div>
            )}
            {consent && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 px-3.5 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                  <ShieldOff className="size-4 shrink-0 text-primary" />
                  Location tracing is on for this trip — your route saves about every 5 seconds while you move, only while the app stays open.
                </span>
                <Button variant="ghost" size="sm" className={cn('shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive')} onClick={handleRevokeConsent}>
                  Turn off
                </Button>
              </div>
            )}
            {(viewTrip.stops.length > 0) && (
              <div className="mt-3 border-t pt-3">
                <Button variant="ghost" size="sm" className="w-full gap-2" onClick={() => setChecklistOpen(true)}>
                  <ListChecks className="size-4 text-primary" />
                  Trip checklist · {viewTrip.stops.filter(s => s.completedAt).length} of {viewTrip.stops.length} done
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <Dialog open={checklistOpen} onOpenChange={setChecklistOpen}>
          <DialogContent className="max-h-[82svh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Check off stops</DialogTitle>
            </DialogHeader>
            <TripChecklist tripId={tripId} stops={viewTrip.stops} editable={viewTrip.role !== 'viewer'} />
          </DialogContent>
        </Dialog>
      </div>
    </RequireSubscription>
  )
}
