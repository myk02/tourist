'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { MapPin, Navigation, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { KenyaMap } from './kenya-map'
import { RequireAuth, useTripId } from './shared'

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function Track() {
  const id = useTripId()
  const trip = useQuery(api.trips.getWithStops, { id })
  const me = useQuery(api.users.me)
  const recorded = useQuery(api.positions.forTrip, { tripId: id })
  const record = useMutation(api.positions.record)
  const setConsent = useMutation(api.users.setTrackingConsent)

  const watchId = useRef<number | null>(null)
  const lastRecordedRef = useRef<{ lat: number; lng: number; at: number } | null>(null)
  const [tracking, setTracking] = useState(false)
  const [livePath, setLivePath] = useState<[number, number][]>([])
  const [lastPoint, setLastPoint] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)

  // Stop the geolocation watch when leaving the page — otherwise it keeps
  // recording the traveller's location in the background forever.
  useEffect(() => () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  const consent = me?.trackingConsent === true

  const route = trip?.stops.filter(s => s.lat && s.lng).map(s => [s.lng!, s.lat!] as [number, number]) || []
  const mapPoints = trip?.stops.filter(s => s.lat && s.lng).map(s => ({ id: s._id, name: s.name, location: s.place, lat: s.lat!, lng: s.lng! })) || []
  const recordedPath = recorded?.map(p => [p.lng, p.lat] as [number, number]) || []
  const livePoints = lastPoint ? [{ id: 'live', name: 'You are here', location: `Live · ±${Math.round(lastPoint.accuracy)} m`, lat: lastPoint.lat, lng: lastPoint.lng }] : []
  const paths = [
    ...(recordedPath.length >= 2 ? [recordedPath] : []),
    ...(livePath.length >= 2 ? [livePath] : []),
  ]

  function stop() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    setTracking(false)
    toast.success('Tracking stopped')
  }

  function start() {
    if (!navigator.geolocation) {
      toast.error('Location is not supported')
      return
    }
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    setLivePath([])
    setLastPoint(null)
    lastRecordedRef.current = null
    watchId.current = navigator.geolocation.watchPosition(
      async position => {
        const p = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }
        setLastPoint(p)
        setLivePath(prev => (prev.length && prev[prev.length - 1][0] === p.lng && prev[prev.length - 1][1] === p.lat ? prev : [...prev, [p.lng, p.lat]]))
        // Only persist a point when it actually moved, and at most once per
        // 5s — the browser can fire updates much faster than that.
        const last = lastRecordedRef.current
        const now = Date.now()
        const movedEnough = !last || metersBetween(last.lat, last.lng, p.lat, p.lng) > 30
        const beenAWhile = !last || now - last.at > 5000
        if (movedEnough && beenAWhile) {
          lastRecordedRef.current = { lat: p.lat, lng: p.lng, at: now }
          try {
            await record({ tripId: id, lat: p.lat, lng: p.lng, accuracy: p.accuracy })
          } catch {
            // transient write failures shouldn't stop the trace
          }
        }
      },
      () => toast.error('Could not access location'),
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 }
    )
    setTracking(true)
    toast.success('Live tracking started')
  }

  if (trip === undefined || me === undefined) return <div className="min-h-screen animate-pulse bg-secondary" />
  if (!trip) return null

  return (
    <RequireAuth>
      <div className="relative min-h-[calc(100vh-4rem)]">
        <KenyaMap points={[...mapPoints, ...livePoints]} route={route} paths={paths} className="h-[calc(100vh-4rem)] rounded-none" />
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
            ) : (
              <div className="flex items-center gap-4">
                <span className={`flex size-12 shrink-0 items-center justify-center rounded-md text-white ${tracking ? 'animate-pulse bg-red-500' : 'bg-primary'}`}>
                  {tracking ? <Square className="size-4" /> : <Navigation />}
                </span>
                <div className="flex-1">
                  <p className="font-semibold">{tracking ? 'Live tracking in progress' : 'Ready to trace your journey?'}</p>
                  <p className="text-sm text-muted-foreground">
                    {tracking
                      ? `${livePath.length} point${livePath.length === 1 ? '' : 's'} recorded${lastPoint ? ` · ±${Math.round(lastPoint.accuracy)} m` : ''}`
                      : `Only you can see this trip location${recordedPath.length ? ` · ${recordedPath.length} points saved earlier` : ''}.`}
                  </p>
                </div>
                <Button variant={tracking ? 'destructive' : 'default'} onClick={tracking ? stop : start}>
                  {tracking ? 'End' : 'Start'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RequireAuth>
  )
}
