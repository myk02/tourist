'use client'

import Link from 'next/link'
import { ArrowRight, Compass, Loader2, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/kt/progress-bar'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { KenyaMap } from '../../kenya-map'
import { useJourney } from '../context'

/** Stage 4 — live tracking for the freshly saved trip. */
export function TrackStage() {
  const {
    router, draft, goTo, plan,
    saving, handleSaveTrip,
    activeSession, tracking, consentPrompt, localConsent, toggleConsent, startTracking, stopTracking,
    planMapPoints, planHighlight, planDestIds, mapRoute,
  } = useJourney()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Live tracking</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Track your way there</h1>
        {plan && <p className="mt-2 text-muted-foreground">Destination: {plan.destination}.</p>}
      </div>

      {!draft.tripId ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-10 text-center">
          <Navigation className="size-10 text-primary" />
          <h2 className="font-serif text-3xl">Save your plan to start tracking</h2>
          <p className="max-w-md text-muted-foreground">Your live location will be recorded on the map until you reach {plan?.destination ?? 'your destination'}.</p>
          <div className="flex gap-3">
            <Button onClick={handleSaveTrip} disabled={saving} className="gap-2">{saving ? <><Loader2 className="size-4 animate-spin" />Saving…</> : 'Save trip'}</Button>
            <Button variant="outline" onClick={() => goTo('plan')}>Back to plan</Button>
          </div>
        </div>
      ) : (
        <>
          <KenyaMap
            points={planMapPoints}
            highlight={planHighlight}
            destIds={planDestIds}
            route={mapRoute.length >= 2 ? mapRoute : undefined}
            live={activeSession?.lastPoint ?? null}
            livePath={activeSession?.path && activeSession.path.length >= 2 ? activeSession.path : undefined}
            followLive={tracking}
            className="h-[420px]"
          />

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              {!tracking && activeSession?.status !== 'arrived' && consentPrompt && (
                <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5">
                  <label htmlFor="kt-track-consent" className="text-sm text-muted-foreground">Record your route while you travel?</label>
                  <Switch
                    id="kt-track-consent"
                    checked={localConsent}
                    onCheckedChange={toggleConsent}
                    aria-label="Record your route while you travel"
                  />
                </div>
              )}
              <div className="min-w-0">
                {activeSession?.status === 'arrived' ? (
                  <>
                    <p className="font-semibold">You&apos;ve arrived at {plan?.destination}</p>
                    <p className="text-sm text-muted-foreground">Live tracking detected your arrival — 100% of the way there.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{tracking ? 'Live tracking in progress' : 'Ready to trace your journey?'}</p>
                    <p className="text-sm text-muted-foreground">
                      {tracking
                        ? activeSession?.distanceKm != null
                          ? `${activeSession.distanceKm.toFixed(1)} km to ${plan?.destination} · ${activeSession.path.length} point${activeSession.path.length === 1 ? '' : 's'} recorded`
                          : `${activeSession?.path.length ?? 0} point${activeSession?.path.length === 1 ? '' : 's'} recorded`
                        : `Your route from ${draft.origin} to ${plan?.destination ?? 'your destination'} — your route saves every few seconds while you move, only while this page or its widget stays open.`}
                    </p>
                    <ProgressBar value={activeSession?.progressPct ?? 0} label="Trip progress" className="mt-2 w-full max-w-sm" />
                    <p className="mt-1 text-xs text-muted-foreground">{activeSession?.progressPct ?? 0}% of the way there</p>
                  </>
                )}
              </div>
              <Button
                variant={tracking ? 'destructive' : 'default'}
                onClick={tracking ? stopTracking : activeSession?.status === 'arrived' ? () => router.push(`/trips/${draft.tripId}/track`) : startTracking}
                disabled={!draft.tripId}
              >
                {tracking ? 'Stop tracking' : activeSession?.status === 'arrived' ? 'Continue' : 'Start tracking'}
              </Button>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => goTo('plan')}>Back to plan</Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => router.push('/discover')} className="gap-2"><Compass className="size-4" />Continue exploring</Button>
              <Button size="lg" nativeButton={false} render={<Link href={`/trips/${draft.tripId}?tab=bookings`} />} className="gap-2">Add a booking</Button>
              <Button size="lg" onClick={() => goTo('share')} className="gap-2">Share your experience <ArrowRight className="size-4" /></Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
