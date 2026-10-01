'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { CalendarDays, Check, Loader2, MapPin, Route, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { calendarDayDiff, localDateOnly } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { ChecklistStop } from './trip-checklist'
import { useChecklistToggle } from './use-checklist'

export interface TodayStop extends ChecklistStop {
  travelKm?: number
  travelMins?: number
}

/**
 * The in-trip anchor. AI planners are famously "great for planning, awful
 * during the trip" — this card is the fix: today's itinerary day, sorted by
 * time, checkable, with the drive to each next stop and a one-tap way to send
 * companions a live route link when you're running late.
 */
export function TodayCard({
  tripId,
  startDate,
  stops,
  editable = true,
  isOwner,
}: {
  tripId: string
  startDate?: string
  stops: TodayStop[]
  editable?: boolean
  isOwner: boolean
}) {
  const enableTraceShare = useMutation(api.trips.enableTraceShare)
  const tid = tripId as Id<'trips'>
  // Today is resolved after mount so server and client first renders agree.
  const [todayISO, setTodayISO] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const { overrides, toggle } = useChecklistToggle(tripId)

  useEffect(() => {
    setTodayISO(localDateOnly(new Date()))
  }, [])

  // Which itinerary day is it today? Outside the planned days (before day 1,
  // after the last stop) there is no "today" to show.
  const dayNumber = useMemo(() => {
    if (!todayISO || !startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null
    if (!stops.length) return null
    const diff = calendarDayDiff(startDate, todayISO)
    const maxDay = stops.reduce((m, s) => Math.max(m, s.day), 1)
    const n = diff + 1
    if (n < 1 || n > maxDay) return null
    return n
  }, [todayISO, startDate, stops])

  const todaysStops = useMemo(
    () =>
      dayNumber == null
        ? []
        : stops.filter(s => s.day === dayNumber).sort((a, b) => a.time.localeCompare(b.time)),
    [stops, dayNumber],
  )

  const isDone = (s: TodayStop) => overrides[s._id] ?? !!s.completedAt
  const doneCount = todaysStops.filter(isDone).length
  const pct = todaysStops.length ? Math.round((doneCount / todaysStops.length) * 100) : 0

  async function copyRouteLink() {
    setSharing(true)
    try {
      let url = `${window.location.origin}/trips/${tripId}`
      if (isOwner) {
        try {
          const { token } = await enableTraceShare({ tripId: tid })
          url = `${window.location.origin}/trace/${tripId}?t=${token}`
        } catch {
          // Fall back to the trip link rather than failing outright.
        }
      }
      await navigator.clipboard.writeText(url)
      toast.success(isOwner ? 'Live route link copied — send it to whoever is waiting' : 'Trip link copied')
    } catch {
      toast.error('Could not copy the route link')
    } finally {
      setSharing(false)
    }
  }

  // No mappable day (dateless trips, or outside the stop range): stay quiet.
  if (dayNumber == null) return null

  return (
    <Card className="border-primary/30 bg-primary/[0.04] shadow-soft">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-none bg-primary text-primary-foreground shadow-xs"><CalendarDays className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-lg font-semibold tracking-tight">Today · Day {dayNumber}</p>
            <p className="text-xs text-muted-foreground">
              {todaysStops.length === 0
                ? 'No stops scheduled for today'
                : doneCount === todaysStops.length
                  ? `All ${todaysStops.length} stop${todaysStops.length === 1 ? '' : 's'} checked off — enjoy the evening`
                  : `${doneCount} of ${todaysStops.length} done`}
            </p>
          </div>
          {todaysStops.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyRouteLink()} disabled={sharing}>
              {sharing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Running late? Share my route
            </Button>
          )}
        </div>

        {todaysStops.length > 0 && (
          <>
            <Progress value={pct} />
            <ol className="flex flex-col gap-2">
              {todaysStops.map((s, i) => {
                const done = isDone(s)
                const next = todaysStops[i + 1]
                const leg = s.travelKm != null || s.travelMins != null
                return (
                  <li key={s._id}>
                    <button
                      type="button"
                      disabled={!editable}
                      aria-pressed={done}
                      onClick={() => toggle(s._id, done)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-none border px-3 py-2.5 text-left transition-colors',
                        done ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-card',
                        !editable && 'cursor-default',
                      )}
                    >
                      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-none border transition-colors', done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 text-transparent')}>
                        <Check className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm font-medium', done && 'text-muted-foreground line-through')}>{s.time} · {s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.place} · {s.kind}</span>
                      </span>
                    </button>
                    {next && leg && (
                      <p className="ml-11 mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Route className="size-3" />
                        {s.travelKm != null ? `${s.travelKm} km` : null}
                        {s.travelKm != null && s.travelMins != null ? ' · ' : null}
                        {s.travelMins != null ? `~${Math.round(s.travelMins / 5) * 5} min to next` : null}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          </>
        )}

        {todaysStops.length === 0 && (
          <Button variant="outline" size="sm" className="w-fit gap-1.5" nativeButton={false} render={<Link href={`/trips/${tripId}?tab=itinerary`} />}>
            <MapPin className="size-3.5" />
            Open the itinerary
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
