'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { CheckCircle2, Lightbulb, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export interface BriefStop {
  name: string
  place: string
  day: number
  time: string
  kind: string
  cost: number
  verified?: boolean
  travelKm?: number
  travelMins?: number
}

interface Brief {
  summary: string
  highlights: string[]
  tip: string
}

function parseBrief(raw?: string): Brief | null {
  if (!raw) return null
  try {
    const b = JSON.parse(raw) as Brief
    if (typeof b.summary !== 'string' || !Array.isArray(b.highlights)) return null
    return b
  } catch {
    return null
  }
}

/**
 * The AI trip brief — a short, honest summary of the traveller's *actual*
 * saved stops, generated on demand and stored on the trip so it isn't
 * regenerated (or re-costed) on every visit. Only the owner sees the
 * generate button; collaborators just read it.
 */
export function TripBriefCard({
  tripId,
  aiBrief,
  stops,
  origin,
  destination,
  startDate,
  travelMonth,
  doneCount,
  editable,
}: {
  tripId: Id<'trips'>
  aiBrief?: string
  stops: BriefStop[]
  origin?: string
  destination?: string
  startDate?: string
  /** The traveller's chosen "YYYY-MM" if they picked one — more accurate than startDate. */
  travelMonth?: string
  /** How many stops are already checked off — the brief can celebrate progress. */
  doneCount: number
  editable: boolean
}) {
  const updateTrip = useMutation(api.trips.update)
  const [busy, setBusy] = useState(false)
  const brief = parseBrief(aiBrief)

  async function generate() {
    if (!stops.length) { toast.error('Add some stops to this trip first'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          month: travelMonth || (startDate ? startDate.slice(0, 7) : undefined),
          stops: stops.map(s => ({
            title: s.name,
            place: s.place,
            day: s.day,
            kind: s.kind,
            cost: s.cost,
            verified: !!s.verified,
            travelKm: s.travelKm,
            travelMins: s.travelMins,
          })),
          doneCount,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || 'Could not generate the brief')
      }
      const data = await response.json()
      await updateTrip({ id: tripId, patch: { aiBrief: JSON.stringify(data) } })
      toast.success('Trip brief generated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate the trip brief')
    } finally {
      setBusy(false)
    }
  }

  if (!brief) {
    if (!editable) return null
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary"><Sparkles className="size-5" /></span>
          <div>
            <p className="font-semibold">Trip brief</p>
            <p className="mt-0.5 max-w-md text-sm text-muted-foreground">A short, honest summary of this exact itinerary — highlights and a practical tip, grounded in your actual stops.</p>
          </div>
          <Button size="sm" onClick={() => void generate()} disabled={busy || !stops.length} className="gap-2">
            {busy ? <><Loader2 className="size-4 animate-spin" />Writing…</> : <><Sparkles className="size-4" />Generate my trip brief</>}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight"><Sparkles className="size-4 text-primary" />Trip brief</p>
          {editable && (
            <Button variant="ghost" size="sm" onClick={() => void generate()} disabled={busy} className="gap-1.5 text-xs">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Regenerate
            </Button>
          )}
        </div>
        <p className="text-sm leading-relaxed">{brief.summary}</p>
        <ul className="flex flex-col gap-1.5">
          {brief.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
        <p className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2.5 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" />
          <span><span className="font-semibold">Tip: </span>{brief.tip}</span>
        </p>
      </CardContent>
    </Card>
  )
}
