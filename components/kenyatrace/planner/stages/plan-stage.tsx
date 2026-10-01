'use client'

import Link from 'next/link'
import { ArrowRight, FileDown, Loader2, Navigation, Printer, Route, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SuggestedBadge, VerifiedBadge } from '@/components/ui/kt/badges'
import { Card } from '@/components/ui/card'
import { dailyAllowance } from '@/lib/budget'
import { buildPrintableItinerary, type PrintableItinerary } from '@/lib/itinerary'
import { downloadItineraryImage } from '@/lib/itinerary-image'
import { formatKES } from '@/lib/kenya-data'
import { seasonLabel } from '@/lib/seasons'
import { cn } from '@/lib/utils'
import { ItineraryEditor } from '../../itinerary-editor'
import { KenyaMap } from '../../kenya-map'
import { BudgetBar, ListingImage } from '../../shared'
import { WhereYouStay } from '../../where-you-stay'
import { useJourney } from '../context'
import { formatMins } from '../lib'

/** Stage 3 — the generated plan: journey legs, map, stays, day-by-day. */
export function PlanStage() {
  const {
    draft, setDraft, goTo, plan, allListings,
    saving, adjustOpen, setAdjustOpen,
    handleSaveTrip, handleEditorSave, handleSwapStay, handleAddStay, replanDay,
    dayGroups, planMapPoints, planHighlight, planDestIds, mapRoute,
  } = useJourney()

  // The plan has no saved dates yet — exports synthesize the planned window
  // (today → +days), matching how the trip will be created on save.
  function exportData(): PrintableItinerary {
    if (!plan) throw new Error('No plan')
    const start = new Date()
    const end = new Date(start.getTime() + 86_400_000 * Math.max(draft.days - 1, 0))
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      name: plan.name,
      destination: plan.destination,
      origin: draft.origin,
      startDate: iso(start),
      endDate: iso(end),
      budget: draft.budget,
      totalCost: plan.stops.reduce((sum, s) => sum + s.cost, 0),
      stops: plan.stops.map(s => ({
        day: s.day, time: s.time, name: s.title, place: s.place, kind: s.kind,
        cost: s.cost, verified: s.verified, travelKm: s.travelKm, travelMins: s.travelMins,
      })),
    }
  }

  function handlePrint() {
    let doc: string
    try {
      doc = buildPrintableItinerary(exportData())
    } catch {
      toast.error('Could not build the printable itinerary')
      return
    }
    const win = window.open('', '_blank', 'width=860,height=1000')
    if (!win) {
      toast.error('Popup blocked — allow popups to print the itinerary')
      return
    }
    win.document.write(doc)
    win.document.close()
    setTimeout(() => win.print(), 350)
  }

  async function handleDownloadImage() {
    try {
      await downloadItineraryImage(exportData())
      toast.success('Itinerary image downloaded')
    } catch {
      toast.error('Could not create the image')
    }
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-none border border-dashed p-10 text-center">
          <Route className="size-10 text-primary" />
          <h2 className="font-serif text-3xl">Your plan isn&apos;t ready yet</h2>
          <p className="text-muted-foreground">Set your budget and we&apos;ll build it.</p>
          <Button onClick={() => goTo('budget')}>Set my budget</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          From {draft.origin}
          {draft.travelMonth && seasonLabel(draft.travelMonth) && (<><span className="mx-2 text-muted-foreground">·</span>{seasonLabel(draft.travelMonth)}</>)}
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">{plan.name}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{plan.summary}</p>
        <p className="mt-3 rounded-none border border-primary/25 bg-primary/5 px-3.5 py-2.5 text-sm text-primary"><Sparkles className="mr-1 inline size-4 align-[-3px]" />{plan.originNote}</p>
      </div>

      {/* Budget vs plan cost */}
      <BudgetBar stops={plan.stops} budget={draft.budget} perDay={dailyAllowance(draft.budget, draft.days)} />

      {/* How to get there — route + cost cards, nothing else */}
      <div>
        <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight"><Navigation className="size-5 text-primary" /> How to get there</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plan.journey.map((leg) => (
            <Card key={`${leg.from}-${leg.to}-${leg.how}`} className="p-4">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{leg.from}</p>
                <ArrowRight className="size-4 shrink-0 text-primary" />
                <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold">{leg.to}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={leg.how}>{leg.how}</p>
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-lg font-bold text-primary">{formatKES(leg.cost)}</span>
                <span className="text-xs text-muted-foreground">{leg.distanceKm} km · ~{leg.timeMins} min</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <KenyaMap points={planMapPoints} highlight={planHighlight} destIds={planDestIds} route={mapRoute.length >= 2 ? mapRoute : undefined} className="h-96" />

      {/* Where you'll stay — every night, plus nearby verified alternatives to swap in */}
      <WhereYouStay
        stops={plan.stops}
        listings={allListings}
        budgetPerDay={dailyAllowance(draft.budget, draft.days)}
        origin={draft.origin}
        destination={plan.destination}
        onSwap={handleSwapStay}
        onAdd={handleAddStay}
      />

      {/* Day-by-day with per-stop directions */}
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Your days</h2>
        <div className="mt-3 flex flex-col gap-5">
          {dayGroups.map(([day, stops]) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Day {day}</h3>
              <div className="flex flex-col gap-2">
                {stops.map((s, idx) => (
                  <Card key={`${s.listingId ?? s.title}-${s.day}-${s.time}-${idx}`} className="p-4">
                    <div className="flex gap-3.5">
                      {s.image && (
                        <div className="relative hidden size-16 shrink-0 overflow-hidden rounded-none sm:block">
                          <ListingImage src={s.image} alt={s.title} fill className="object-cover" sizes="64px" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {s.verified && s.listingId && s.vertical ? (
                              <Link href={`/discover/${s.vertical}/${s.listingId}`} className="transition-colors hover:text-primary hover:underline underline-offset-2">{s.title}</Link>
                            ) : (
                              s.title
                            )}
                          </p>
                          <Badge className="text-[10px]">{s.kind}</Badge>
                          {s.verified ? (
                            <VerifiedBadge className="text-[10px]" />
                          ) : (
                            <SuggestedBadge className="text-[10px]" />
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{s.time} · {s.place}</p>
                        {s.travelKm != null && idx > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Navigation className="size-3 shrink-0 text-primary" />
                            {s.travelKm} km · ~{formatMins(s.travelMins ?? 0)} from {stops[idx - 1]?.title}
                            <span className={cn('rounded-none px-1.5 py-px text-[10px] font-medium', s.travelRouted ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground')}>
                              {s.travelRouted ? 'routing' : 'estimate'}
                            </span>
                          </p>
                        )}
                        {s.howToGetThere && <p className="mt-1.5 text-sm"><span className="font-medium text-primary">Getting there: </span>{s.howToGetThere}</p>}
                        {s.reason && <p className="mt-1 text-sm italic text-muted-foreground/80">{s.reason}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{s.verified ? formatKES(s.cost) : `~${formatKES(s.cost)}`}</p>
                        <p className="text-[10px] text-muted-foreground">{s.verified ? `per ${s.unit ?? s.vertical ?? 'unit'}` : 'estimate'}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!draft.tripId ? (
          <>
            <Button size="lg" onClick={handleSaveTrip} disabled={saving} className="gap-2">
              {saving ? <><Loader2 className="size-4 animate-spin" />Saving…</> : <><Navigation className="size-4" />Save trip & start tracking</>}
            </Button>
            <Button variant="outline" onClick={() => setAdjustOpen(o => !o)}>Adjust plan</Button>
          </>
        ) : (
          <>
            {/* Saved already — the two next steps live right here instead of only in the hub. */}
            <Button size="lg" nativeButton={false} render={<Link href={`/trips/${draft.tripId}`} />}>Open my trip</Button>
            <Button variant="outline" nativeButton={false} render={<Link href={`/trips/${draft.tripId}?tab=bookings`} />}>Add a booking</Button>
            <Button variant="outline" nativeButton={false} render={<Link href={`/trips/${draft.tripId}/track`} />}>Set up tracking</Button>
            <Button variant="ghost" onClick={() => setAdjustOpen(o => !o)}>Adjust plan</Button>
          </>
        )}
        <div className="flex flex-1 flex-wrap gap-2">
          <Button variant="outline" onClick={handlePrint} className="gap-1.5"><Printer className="size-4" />Print / PDF</Button>
          <Button variant="outline" onClick={() => void handleDownloadImage()} className="gap-1.5"><FileDown className="size-4" />Save image</Button>
        </div>
        <Button variant="ghost" onClick={() => goTo('budget')}>Back to budget</Button>
      </div>

      {adjustOpen && (
        <ItineraryEditor
          key={plan.name}
          initial={plan.stops}
          budget={draft.budget}
          title={plan.name}
          defaultMobileView="list"
          onSave={handleEditorSave}
          onReplanDay={replanDay}
          onChange={stops => setDraft(d => (d.plan ? { ...d, plan: { ...d.plan, stops } } : d))}
        />
      )}
    </div>
  )
}
