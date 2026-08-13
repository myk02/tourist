'use client'

import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface ChecklistStop {
  _id: Id<'tripStops'>
  day: number
  time: string
  name: string
  place: string
  kind: string
  completedAt?: number
}

/**
 * The trip checklist: day-by-day stops the traveller checks off as they go,
 * with live progress ("7 of 14 done"). Viewers get a read-only list — only
 * the owner and editors can toggle stops.
 */
export function TripChecklist({ tripId, stops, editable = true }: { tripId: Id<'trips'>; stops: ChecklistStop[]; editable?: boolean }) {
  const setCompleted = useMutation(api.trips.setStopCompleted)

  const done = stops.filter(s => s.completedAt).length
  const pct = stops.length ? Math.round((done / stops.length) * 100) : 0
  const days = [...new Set(stops.map(s => s.day))].sort((a, b) => a - b)

  function toggle(stopId: Id<'tripStops'>, isDone: boolean) {
    setCompleted({ tripId, stopId, completed: !isDone })
      .then(() => {})
      .catch(() => toast.error('Could not update this stop'))
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Trip checklist</p>
          <p className="text-sm font-semibold text-primary">{done} of {stops.length} done</p>
        </div>
        <Progress className="mt-2 h-2" value={pct} />
        {stops.length > 0 && pct === 100 && <p className="mt-1 text-xs font-medium text-primary">Every stop checked off — trip complete!</p>}
      </div>

      {stops.length === 0 ? (
        <p className="text-sm text-muted-foreground">This trip has no stops yet.</p>
      ) : (
        days.map(day => (
          <div key={day}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day {day}</p>
            <div className="flex flex-col gap-1.5">
              {stops
                .filter(s => s.day === day)
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(s => {
                  const isDone = !!s.completedAt
                  return (
                    <button
                      key={s._id}
                      type="button"
                      disabled={!editable}
                      onClick={() => toggle(s._id, isDone)}
                      aria-pressed={isDone}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        isDone ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-card',
                        !editable && 'cursor-default',
                      )}
                    >
                      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors', isDone ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 text-transparent')}>
                        <Check className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm font-medium', isDone && 'text-muted-foreground line-through')}>{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.time} · {s.place} · {s.kind}</span>
                      </span>
                    </button>
                  )
                })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
