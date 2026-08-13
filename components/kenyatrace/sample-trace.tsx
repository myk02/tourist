'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatKES } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { SAMPLE_TRACE, sampleTraceCosts } from '@/lib/sample-trace'
import { KenyaMap } from './kenya-map'

const KIND_STYLE: Record<string, string> = {
  Stay: 'bg-blue-100 text-blue-800',
  Transport: 'bg-amber-100 text-amber-800',
  Experience: 'bg-emerald-100 text-emerald-800',
  Food: 'bg-rose-100 text-rose-800',
}

/**
 * Guest-facing, read-only preview of the 7-day Classic Kenya Safari & Coast
 * Trace. Opens from the hero ("View sample trace") so visitors can explore the
 * map, daily stops and budget without creating an account.
 */
export function SampleTraceDialog() {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="lg" className="gap-2" onClick={() => setOpen(true)}>
        <MapPinIcon />
        View sample trace
      </Button>
      {open && (
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <SampleTraceBody onExplore={() => setOpen(false)} />
        </DialogContent>
      )}
    </Dialog>
  )
}

function MapPinIcon() {
  return <span className="text-primary">◦</span>
}

export function SampleTraceBody({ onExplore }: { onExplore?: () => void }) {
  const { stops, budget, name, summary, destination } = SAMPLE_TRACE
  const costs = useMemo(() => sampleTraceCosts(stops), [stops])
  const [activeDay, setActiveDay] = useState<string>('all')

  const mapData = useMemo(() => {
    const day = activeDay === 'all' ? null : parseInt(activeDay, 10)
    const filtered = day === null ? stops : stops.filter(s => s.day === day)
    const points = filtered.filter(s => s.lat && s.lng).map(s => ({ id: `${s.title}-${s.day}`, name: s.title, location: s.place, lat: s.lat!, lng: s.lng! }))
    const route = filtered.filter(s => s.lat && s.lng).map(s => [s.lng!, s.lat!] as [number, number])
    return { points, route }
  }, [stops, activeDay])

  const days = useMemo(() => {
    const map = new Map<number, typeof stops>()
    for (const s of stops) {
      const arr = map.get(s.day) ?? []
      arr.push(s)
      map.set(s.day, arr)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [stops])

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <Badge className="w-fit">Sample trace · {days.length} days</Badge>
        <DialogTitle className="font-serif text-2xl tracking-tight">{name}</DialogTitle>
        <DialogDescription>{destination}</DialogDescription>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </DialogHeader>

      <KenyaMap points={mapData.points} route={mapData.route} className="h-[46vh] min-h-[300px] rounded-md" />

      <Tabs value={activeDay} onValueChange={setActiveDay}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="all">All days</TabsTrigger>
            {days.map(([day]) => (
              <TabsTrigger key={day} value={String(day)}>Day {day}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-3 flex flex-col gap-4">
          {days.map(([day, dayStops]) => (
            <div key={day} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{day}</span>
                <h3 className="font-semibold">Day {day}</h3>
                <span className="text-sm text-muted-foreground">· {formatKES(costs.byDay.find(([d]) => d === day)?.[1] ?? 0)}</span>
              </div>
              {dayStops.map((stop, i) => (
                <Card key={`${stop.title}-${i}`} className="p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold text-primary">{stop.time}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{stop.title}</p>
                        <Badge className={cn('text-[10px]', KIND_STYLE[stop.kind] ?? 'bg-secondary text-muted-foreground')}>{stop.kind}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{stop.place}</p>
                      {stop.reason && <p className="mt-1 text-xs italic text-muted-foreground/80">“{stop.reason}”</p>}
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{formatKES(stop.cost)}</span>
                  </div>
                </Card>
              ))}
            </div>
          ))}
        </TabsContent>

        {days.map(([day, dayStops]) => (
          <TabsContent key={day} value={String(day)} className="mt-3 flex flex-col gap-2">
            {dayStops.map((stop, i) => (
              <Card key={`${stop.title}-${i}`} className="p-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold text-primary">{stop.time}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{stop.title}</p>
                      <Badge className={cn('text-[10px]', KIND_STYLE[stop.kind] ?? 'bg-secondary text-muted-foreground')}>{stop.kind}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{stop.place}</p>
                    {stop.reason && <p className="mt-1 text-xs italic text-muted-foreground/80">“{stop.reason}”</p>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{formatKES(stop.cost)}</span>
                </div>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget at a glance</CardTitle>
          <CardDescription>{formatKES(costs.total)} planned of a {formatKES(budget)} brief</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={Math.min((costs.total / budget) * 100, 100)} />
          <div className="flex flex-col gap-1.5">
            {costs.byKind.map(([kind, value]) => (
              <div key={kind} className="flex items-center gap-2 text-xs">
                <span className="flex w-28 shrink-0 items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', KIND_STYLE[kind]?.split(' ')[1])} />
                  {kind}
                </span>
                <Progress className="h-1.5 flex-1" value={Math.min((value / Math.max(costs.total, 1)) * 100, 100)} />
                <span className="w-16 shrink-0 text-right text-muted-foreground">{formatKES(value)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">This is a read-only preview. Build your own in minutes — no account needed to start.</p>
        {onExplore && (
          <Button nativeButton={false} render={<a href="/plan" />}>Plan your own trip</Button>
        )}
      </div>
    </div>
  )
}
