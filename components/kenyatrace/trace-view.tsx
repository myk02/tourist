'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { CalendarDays, Footprints, MapPin, Radio, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isValidConvexId } from '@/lib/id'
import { KenyaMap } from './kenya-map'

/**
 * The public face of a shared live trace. No sign-in, no costs, no owner
 * details — just the route, the recorded path and how far the traveller went.
 * A wrong or missing token shows the empty state instead of a hint of what
 * exists, so the link stays private until the owner shares it.
 */
export function TraceView({ tripId, token }: { tripId: string; token: string }) {
  // A malformed /trace/<garbage> route must show the empty state, not make
  // Convex throw on an invalid id.
  const validTripId = isValidConvexId(tripId)
  const data = useQuery(api.trips.publicTrace, validTripId ? { tripId: tripId as Id<'trips'>, token } : 'skip')

  const route = useMemo(() => (data?.stops ?? []).filter(s => s.lat != null && s.lng != null).map(s => [s.lng!, s.lat!] as [number, number]), [data])
  const points = useMemo(() => (data?.stops ?? []).filter(s => s.lat != null && s.lng != null).map(s => ({ id: `${s.day}-${s.name}`, name: s.name, location: s.place, lat: s.lat!, lng: s.lng! })), [data])
  const destIds = useMemo(() => (points.length ? [points[points.length - 1].id] : []), [points])
  const livePath = useMemo(() => (data && data.trace.length >= 2 ? data.trace.map(p => [p.lng, p.lat] as [number, number]) : undefined), [data])

  // Freshness tick so "updated Xs ago" never goes stale on screen. Hooks
  // MUST run before any early return — a conditional hook count crashes React.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!data?.lastRecordedAt) return
    const t = setInterval(() => setTick(x => x + 1), 10000)
    return () => clearInterval(t)
  }, [data?.lastRecordedAt])

  const unavailable = (
    <div className="flex min-h-[100svh] items-center justify-center bg-background px-5">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-soft">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Route className="size-6" /></span>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">This trace isn&apos;t available</h1>
        <p className="text-sm text-muted-foreground">The link may be wrong, or the traveller hasn&apos;t shared their trace yet.</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>Back to KenyaTrace</Button>
      </div>
    </div>
  )

  if (!validTripId) return unavailable
  if (data === undefined) return <div className="kt-shimmer min-h-[100svh]" />

  if (!data) return unavailable

  const stopDays = new Set(data.stops.map(s => s.day)).size
  const ageSec = data?.lastRecordedAt ? Math.max(0, Math.round((Date.now() - data.lastRecordedAt) / 1000)) : null
  const freshness = ageSec == null ? null : ageSec < 60 ? 'just now' : ageSec < 3600 ? `${Math.round(ageSec / 60)} min ago` : `${Math.round(ageSec / 3600)}h ago`

  return (
    <div className="relative min-h-[100svh]">
      <KenyaMap
        points={points}
        destIds={destIds}
        route={route.length >= 2 ? route : undefined}
        livePath={livePath}
        className="h-[100svh] rounded-none"
      />
      <div className="absolute inset-x-4 bottom-5 mx-auto max-w-xl">
        <div className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-pop backdrop-blur supports-backdrop-filter:bg-card/85">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Live trip trace</p>
            {freshness && (
              <span className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Radio className="size-3 animate-pulse" /> Updated {freshness}
              </span>
            )}
          </div>
          <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight">{data.trip.name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0 text-primary" />
            {data.trip.destination}{data.trip.origin ? ` · started in ${data.trip.origin}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{data.trip.startDate} → {data.trip.endDate}</span>
            <span className="flex items-center gap-1.5"><Route className="size-3.5" />{stopDays} day{stopDays === 1 ? '' : 's'} · {data.stops.length} stop{data.stops.length === 1 ? '' : 's'}</span>
            {data.distanceKm > 0 && <span className="flex items-center gap-1.5"><Footprints className="size-3.5" />~{data.distanceKm} km traced</span>}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">Made with <span className="font-semibold text-foreground">KenyaTrace</span> — plan your own Kenya trip.</p>
            {/* Start-anywhere handoff: the wizard seeds destination + trip length
                from this trace (no account needed, no costs copied). */}
            <Button size="sm" nativeButton={false} render={<Link href={`/plan?dest=${encodeURIComponent(data.trip.destination)}&days=${stopDays}`} />}>Plan mine like this</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
