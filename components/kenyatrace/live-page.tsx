'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Compass, MapPin, Navigation, Share2, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { geocodeArea } from '@/lib/geocode'
import { KenyaMap } from './kenya-map'
import { useTripId } from './shared'
import { useTracking } from './tracking-provider'
import { RequireSubscription } from './paywall'

export function Track() {
  const id = useTripId()
  const router = useRouter()
  const trip = useQuery(api.trips.getWithStops, { id })
  const me = useQuery(api.users.me)
  const recorded = useQuery(api.positions.forTrip, { tripId: id })
  const setConsent = useMutation(api.users.setTrackingConsent)
  const { session, start, stop } = useTracking()

  // Resolve the saved origin label to coordinates so the map can show the
  // trip's starting point (lat 0 is the equator — null-check, not truthiness).
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

  const route = useMemo(() => (trip?.stops ?? []).filter(s => s.lat != null && s.lng != null).map(s => [s.lng!, s.lat!] as [number, number]), [trip])
  const mapPoints = useMemo(() => (trip?.stops ?? []).filter(s => s.lat != null && s.lng != null).map(s => ({ id: s._id, name: s.name, location: s.place, lat: s.lat!, lng: s.lng! })), [trip])
  const trackPoints = useMemo(() => [...(originPoint ? [originPoint] : []), ...mapPoints], [originPoint, mapPoints])
  const trackHighlight = useMemo(() => (originPoint ? ['origin'] : []), [originPoint])
  const trackDestIds = useMemo(() => (mapPoints.length ? [mapPoints[mapPoints.length - 1].id] : []), [mapPoints])

  const consent = me?.trackingConsent === true
  const active = session && session.tripId === id ? session : null
  const tracking = active?.status === 'tracking'
  const arrived = active?.status === 'arrived'

  const destinationStop = trip?.stops.filter(s => s.lat != null && s.lng != null).slice(-1)[0]
  const dest = destinationStop ? { name: destinationStop.name, lat: destinationStop.lat!, lng: destinationStop.lng! } : null

  const recordedPath = useMemo(() => recorded?.map(p => [p.lng, p.lat] as [number, number]) || [], [recorded])
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
      tripId: id,
      tripName: trip?.name ?? 'Trip',
      destinationName: trip?.destination || dest.name,
      destLat: dest.lat,
      destLng: dest.lng,
      originLabel: trip?.origin,
    })
    toast.success('Live tracking started')
  }

  function handleStop() {
    stop()
    toast.success('Tracking stopped')
  }

  if (trip === undefined || me === undefined) return <div className="min-h-screen animate-pulse bg-secondary" />
  if (!trip) return null

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
        <Card className="absolute bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2">
          <CardContent className="p-4">
            {!consent ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground"><MapPin /></span>
                  <div className="flex-1">
                    <p className="font-semibold">Share your live location?</p>
                    <p className="text-sm text-muted-foreground">We record your route to build a trace of your trip. Only you can see it, and you can turn it off anytime.</p>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-md border p-3">
                  <span className="text-sm font-medium">Allow location tracing for this trip</span>
                  <Switch checked={false} onCheckedChange={() => setConsent({ consent: true }).catch(() => toast.error('Could not update location consent'))} />
                </label>
              </div>
            ) : arrived ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white"><Navigation /></span>
                  <div className="flex-1">
                    <p className="font-semibold">You&apos;ve arrived at {trip.destination}</p>
                    <p className="text-sm text-muted-foreground">Live tracking detected your arrival — 100% of the way there.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="gap-2" nativeButton={false} render={<a href={`/moments?trip=${id}`} />}><Share2 className="size-4" />Share your experience (optional)</Button>
                  <Button variant="outline" nativeButton={false} render={<a href={`/trips/${id}`} />}>View trip</Button>
                  <Button variant="ghost" className="gap-2" onClick={() => router.push('/')}><Compass className="size-4" />Back to discover</Button>
                </div>
              </div>
            ) : active ? (
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 animate-pulse items-center justify-center rounded-md bg-red-500 text-white"><Square className="size-4" /></span>
                <div className="flex-1">
                  <p className="font-semibold">Live tracking in progress</p>
                  <p className="text-sm text-muted-foreground">
                    {active.distanceKm != null
                      ? `${active.distanceKm.toFixed(1)} km to ${trip.destination} · ${active.path.length} point${active.path.length === 1 ? '' : 's'} recorded`
                      : `${active.path.length} point${active.path.length === 1 ? '' : 's'} recorded`}
                  </p>
                  <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${active.progressPct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{active.progressPct}% of the way there</p>
                </div>
                <Button variant="destructive" onClick={handleStop}>End</Button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary text-white"><Navigation /></span>
                <div className="flex-1">
                  <p className="font-semibold">Ready to trace your journey?</p>
                  <p className="text-sm text-muted-foreground">
                    Only you can see this trip location{recordedPath.length ? ` · ${recordedPath.length} points saved earlier` : ''}. Tracking keeps running in a small widget while you explore the app.
                  </p>
                </div>
                <Button onClick={handleStart}>Start</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RequireSubscription>
  )
}
