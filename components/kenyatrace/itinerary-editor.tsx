'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { KenyaMap } from './kenya-map'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Car, Clock, GripVertical, List, Lock, LockOpen, Map as MapIcon, Pencil, Plus, RefreshCw, Search, Utensils, Wallet, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatKES } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import type { Stop } from './types'

export const KIND_STYLE: Record<string, string> = {
  Stay: 'bg-blue-100 text-blue-800',
  Transport: 'bg-amber-100 text-amber-800',
  Experience: 'bg-emerald-100 text-emerald-800',
  Food: 'bg-rose-100 text-rose-800',
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function travelRow(a: Stop, b: Stop) {
  if (!a.lat || !a.lng || !b.lat || !b.lng) return null
  const km = distanceKm(a.lat, a.lng, b.lat, b.lng)
  const hours = Math.max(km / 45, 0.25)
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h ? `${h}h ` : ''}${m}min · ${Math.round(km)} km`
}

function kindFromVertical(vertical: string) {
  if (vertical === 'stays') return 'Stay'
  if (vertical === 'attractions' || vertical === 'things-to-do') return 'Experience'
  if (vertical === 'flights' || vertical === 'taxis' || vertical === 'cars') return 'Transport'
  return 'Experience'
}

function SortableStopRow({ stop, position, active, editing, onEditingChange, onUpdate, onRemove }: {
  stop: Stop
  position: number
  active?: boolean
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onUpdate: (patch: Partial<Stop>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${stop.title}-${position}` })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 rounded-md border bg-card p-3 transition-colors', isDragging && 'z-10 opacity-80 shadow-lg', active && 'border-primary ring-2 ring-primary/20')}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold text-primary">{stop.time}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('font-semibold', stop.locked && 'opacity-60')}>{stop.title}</p>
          <Badge className={cn('shrink-0 text-[10px]', KIND_STYLE[stop.kind] ?? 'bg-secondary text-muted-foreground')}>{stop.kind}</Badge>
          {stop.verified && <Badge className="shrink-0 bg-accent text-[10px] text-accent-foreground">Verified</Badge>}
          {stop.locked && <Lock className="size-3 shrink-0 text-primary" />}
        </div>
        <p className="truncate text-sm text-muted-foreground">{stop.place}</p>
        {stop.reason && <p className="mt-0.5 text-xs text-muted-foreground/80">{stop.reason}</p>}
      </div>
      <div className="hidden flex-col items-end gap-1 sm:flex">
        {editing ? (
          <>
            <Input
              type="time"
              className="h-8 w-28"
              value={stop.time}
              aria-label="Time"
              onChange={e => onUpdate({ time: e.target.value })}
            />
            <Input
              type="number"
              className="h-8 w-28"
              value={stop.cost}
              aria-label="Cost"
              onChange={e => onUpdate({ cost: parseInt(e.target.value, 10) || 0 })}
            />
            <Input
              type="number"
              className="h-8 w-28"
              value={stop.duration ?? 60}
              min={5}
              max={1440}
              aria-label="Duration in minutes"
              onChange={e => onUpdate({ duration: parseInt(e.target.value, 10) || 60 })}
            />
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{formatKES(stop.cost)}</p>
            <p className="text-xs text-muted-foreground">{stop.time}</p>
            {stop.duration ? <p className="text-xs text-muted-foreground">{stop.duration >= 60 ? `${Math.round(stop.duration / 60 * 10) / 10}h` : `${stop.duration}min`}</p> : null}
          </>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <Button size="icon" variant="ghost" className="size-8" aria-label={stop.locked ? 'Unlock this stop' : 'Lock this stop'} onClick={() => onUpdate({ locked: !stop.locked })}>
          {stop.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Edit time and cost" onClick={() => onEditingChange(!editing)}>
          {editing ? <X className="size-4" /> : <Pencil className="size-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label={`Remove ${stop.title}`} onClick={onRemove}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function TravelTime({ a, b }: { a: Stop; b: Stop }) {
  const label = travelRow(a, b)
  if (!label) return null
  return (
    <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
      <span className="h-4 w-px bg-border" />
      <Car className="size-3.5" />
      <span>{label}</span>
    </div>
  )
}

export type ItineraryEditorHandle = { addStop: (stop: Omit<Stop, 'day' | 'time'>) => void }

export const ItineraryEditor = forwardRef<ItineraryEditorHandle, {
  initial?: Stop[]
  budget?: number
  title?: string
  storageKey?: string
  defaultMobileView?: 'list' | 'map'
  onSave?: (stops: Stop[]) => void
  onReplanDay?: (day: number, stops: Stop[]) => Promise<Stop[]>
}>(function ItineraryEditor({ initial = [], budget = 80000, title = 'Kenya Highlights', storageKey, defaultMobileView = 'list', onSave, onReplanDay }, ref) {
  // Initialize from the prop only — reading sessionStorage here would make the
  // client's first render differ from the server's (SSR hydration mismatch).
  const [stops, setStops] = useState<Stop[]>(initial)
  // Set once the saved draft has been restored (or confirmed absent), so the
  // write-back effect never clobbers it on first render.
  const [hydrated, setHydrated] = useState(false)
  const [activeDay, setActiveDay] = useState<string>('all')
  // Editing is keyed by the row's stable sortable id (title + position within
  // the day), not a raw index, so deleting a row can't point edits at the
  // wrong stop.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [addTerm, setAddTerm] = useState('')
  const [replanningDay, setReplanningDay] = useState<number | null>(null)
  const [hoveredStop, setHoveredStop] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'map'>(defaultMobileView)
  const sensors = useSensors(useSensor(PointerSensor))

  useImperativeHandle(ref, () => ({
    addStop: (stop) => setStops(prev => {
      const lastDay = prev.length ? Math.max(...prev.map(s => s.day)) : 1
      return [...prev, { ...stop, day: lastDay, time: '09:00' }]
    }),
  }), [])

  const results = useQuery(api.listings.searchAll, { term: addTerm || undefined })

  // Restore a previously-saved draft after mount, so SSR HTML and the client's
  // first paint agree (same empty/initial state), then swap in the draft.
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) setStops(JSON.parse(saved) as Stop[])
    } catch { /* ignore corrupt draft */ }
    setHydrated(true)
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || !hydrated) return
    try { sessionStorage.setItem(storageKey, JSON.stringify(stops)) } catch { /* ignore */ }
  }, [storageKey, hydrated, stops])

  const total = stops.reduce((s, x) => s + x.cost, 0)
  const days = useMemo(() => {
    const map = new Map<number, Stop[]>()
    for (const s of stops) {
      const arr = map.get(s.day) ?? []
      arr.push(s)
      map.set(s.day, arr)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [stops])

  const dayTotals = useMemo(() => {
    const map = new Map<number, number>()
    for (const s of stops) map.set(s.day, (map.get(s.day) ?? 0) + s.cost)
    return map
  }, [stops])

  const kindTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of stops) map.set(s.kind, (map.get(s.kind) ?? 0) + s.cost)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [stops])

  const mapData = useMemo(() => {
    const day = activeDay === 'all' ? null : parseInt(activeDay, 10)
    const filtered = day === null ? stops : stops.filter(s => s.day === day)
    // Preserve the on-screen order (day-major, then the user's arrangement).
    const ordered = [...filtered].sort((a, b) => a.day - b.day)
    const dayIndex = new Map<number, number>()
    const points: { id: string; name: string; location: string; lat: number; lng: number }[] = []
    const route: [number, number][] = []
    // Index every stop within its day (including stops without coordinates),
    // so map point ids match the DOM row ids (`stop-{title}-{i}`) exactly —
    // otherwise marker clicks/hover scroll to the wrong stop.
    for (const s of ordered) {
      const i = dayIndex.get(s.day) ?? 0
      dayIndex.set(s.day, i + 1)
      if (s.lat && s.lng) {
        points.push({ id: `${s.title}-${i}`, name: s.title, location: s.place, lat: s.lat, lng: s.lng })
        route.push([s.lng, s.lat])
      }
    }
    return { points, route }
  }, [stops, activeDay])

  function handleMapSelect(id: string) {
    setHoveredStop(id)
    const el = document.getElementById(`stop-${id}`)
    if (el && el.offsetParent !== null) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (el && typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      // On mobile the row is hidden behind the map — flip back to the list and jump to it.
      setMobileView('list')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      })
    }
  }

  function patchStop(day: number, indexInDay: number, patch: Partial<Stop>) {
    setStops(prev => {
      const next = [...prev]
      let pos = -1
      let seen = 0
      for (let i = 0; i < next.length; i++) {
        if (next[i].day === day) {
          if (seen === indexInDay) { pos = i; break }
          seen++
        }
      }
      if (pos >= 0) next[pos] = { ...next[pos], ...patch }
      return next
    })
  }

  function removeStop(day: number, indexInDay: number) {
    setStops(prev => {
      const next: Stop[] = []
      let seen = 0
      for (const s of prev) {
        if (s.day === day && seen++ === indexInDay) continue
        next.push(s)
      }
      return next
    })
  }

  function handleDragEnd(day: number, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setStops(prev => {
      const dayStops = prev.filter(s => s.day === day)
      const from = dayStops.findIndex((s, i) => `${s.title}-${i}` === active.id)
      const to = dayStops.findIndex((s, i) => `${s.title}-${i}` === over.id)
      if (from < 0 || to < 0) return prev
      const reordered = [...dayStops]
      const [moved] = reordered.splice(from, 1)
      reordered.splice(to, 0, moved)
      const next = [...prev]
      let seen = 0
      for (let i = 0; i < next.length; i++) {
        if (next[i].day === day) next[i] = reordered[seen++]
      }
      return next
    })
  }

  async function replanDay(day: number) {
    if (!onReplanDay) return
    setReplanningDay(day)
    try {
      const dayStops = stops.filter(s => s.day === day)
      const next = await onReplanDay(day, dayStops)
      setStops(prev => {
        const kept = dayStops.filter(s => s.locked)
        const result: Stop[] = []
        let newIdx = 0
        for (const old of dayStops) {
          if (old.locked) {
            result.push(old)
          } else if (newIdx < next.length) {
            result.push({ ...next[newIdx++], day: old.day, locked: false })
          }
        }
        while (newIdx < next.length) result.push({ ...next[newIdx++], day })
        const out: Stop[] = []
        let seen = 0
        for (const s of prev) {
          if (s.day === day) out.push(result[seen++])
          else out.push(s)
        }
        return out
      })
      toast.success(`Day ${day} re-planned`)
    } catch {
      toast.error('Could not re-plan this day')
    } finally {
      setReplanningDay(null)
    }
  }

  function addFromListing(name: string, place: string, cost: number, kind: string, lat: number | undefined, lng: number | undefined) {
    const targetDay = activeDay === 'all' ? (days.length ? days[days.length - 1][0] : 1) : parseInt(activeDay, 10)
    const dayStops = stops.filter(s => s.day === targetDay)
    setStops(prev => [...prev, { day: targetDay, time: dayStops.length ? '15:00' : '09:00', title: name, place, cost, kind, lat, lng }])
    toast.success(`${name} added to day ${targetDay}`)
  }

  function renderStopList(day: number) {
    const dayStops = stops.filter(s => s.day === day)
    if (dayStops.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">No stops yet — add some below or with the search.</p>
    return (
      <div className="flex flex-col gap-1.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={e => handleDragEnd(day, e)}
        >
          <SortableContext items={dayStops.map((s, i) => `${s.title}-${i}`)} strategy={verticalListSortingStrategy}>
            {dayStops.map((stop, i) => (
              <div
                key={`${stop.title}-${i}`}
                id={`stop-${stop.title}-${i}`}
                onMouseEnter={() => setHoveredStop(`${stop.title}-${i}`)}
                onMouseLeave={() => setHoveredStop(null)}
                className="flex flex-col gap-1.5"
              >
                {i > 0 && <TravelTime a={dayStops[i - 1]} b={stop} />}
                <SortableStopRow
                  stop={stop}
                  position={i}
                  active={hoveredStop === `${stop.title}-${i}`}
                  editing={editingKey === `${stop.title}-${i}`}
                  onEditingChange={editing => setEditingKey(editing ? `${stop.title}-${i}` : null)}
                  onUpdate={patch => patchStop(day, i, patch)}
                  onRemove={() => removeStop(day, i)}
                />
              </div>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{days.length}-day route</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight">{title}</h2>
        </div>
        <Badge variant={total > budget ? 'destructive' : 'secondary'}>
          {total > budget ? `${formatKES(total - budget)} over` : `${formatKES(budget - total)} remaining`}
        </Badge>
      </div>

      <Tabs value={activeDay} onValueChange={v => { setActiveDay(v); setHoveredStop(null) }}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="all">All days</TabsTrigger>
            {days.map(([day]) => <TabsTrigger key={day} value={String(day)}>Day {day}</TabsTrigger>)}
          </TabsList>
          {onReplanDay && activeDay !== 'all' && (
            <Button variant="outline" size="sm" className="gap-1.5" disabled={replanningDay !== null} onClick={() => replanDay(parseInt(activeDay, 10))}>
              <RefreshCw className={cn('size-3.5', replanningDay === parseInt(activeDay, 10) && 'animate-spin')} />
              Re-plan this day
            </Button>
          )}
        </div>
        <div className="mt-3 flex w-fit items-center gap-1 rounded-lg border p-1 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileView('list')}
            className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', mobileView === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <List className="size-4" />List
          </button>
          <button
            type="button"
            onClick={() => setMobileView('map')}
            className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', mobileView === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <MapIcon className="size-4" />Map
          </button>
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className={cn('min-w-0', mobileView === 'map' && 'hidden lg:block')}>
            <TabsContent value="all">
              <div className="flex flex-col gap-6">
                {days.map(([day]) => (
                  <div key={day} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{day}</span>
                      <h3 className="font-semibold">Day {day}</h3>
                      <span className="text-sm text-muted-foreground">· {formatKES(dayTotals.get(day) ?? 0)}</span>
                    </div>
                    {renderStopList(day)}
                  </div>
                ))}
                {days.length === 0 && <p className="p-6 text-center text-muted-foreground">No stops yet — add some with the search below.</p>}
              </div>
            </TabsContent>
            {days.map(([day]) => (
              <TabsContent key={day} value={String(day)}>{renderStopList(day)}</TabsContent>
            ))}
          </div>
          <div className={cn(mobileView === 'list' && 'hidden', 'lg:block')}>
            <div className="lg:sticky lg:top-20">
              <KenyaMap
                points={mapData.points}
                route={mapData.route}
                className="h-[60vh] min-h-[420px] lg:h-[560px]"
                hoveredId={hoveredStop}
                onMarkerEnter={setHoveredStop}
                onMarkerLeave={() => setHoveredStop(null)}
                onMarkerSelect={handleMapSelect}
              />
              {mapData.points.length === 0 && (
                <p className="mt-2 text-center text-xs text-muted-foreground">Stops with a location will appear here on the map.</p>
              )}
            </div>
          </div>
        </div>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" /> Budget</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total planned</span>
            <span className="font-semibold">{formatKES(total)} / {formatKES(budget)}</span>
          </div>
          <Progress value={Math.min((total / budget) * 100, 100)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">By day</p>
              {days.map(([day]) => (
                <div key={day} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0">Day {day}</span>
                  <Progress className="h-1.5 flex-1" value={Math.min(((dayTotals.get(day) ?? 0) / Math.max(budget / Math.max(days.length, 1), 1)) * 100, 100)} />
                  <span className="w-16 shrink-0 text-right text-muted-foreground">{formatKES(dayTotals.get(day) ?? 0)}</span>
                </div>
              ))}
              {days.length === 0 && <p className="text-xs text-muted-foreground">No stops yet.</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">By category</p>
              {kindTotals.map(([kind, value]) => (
                <div key={kind} className="flex items-center gap-2 text-xs">
                  <span className="flex w-24 shrink-0 items-center gap-1"><Utensils className="size-3 hidden" />{kind}</span>
                  <Progress className="h-1.5 flex-1" value={Math.min((value / Math.max(total, 1)) * 100, 100)} />
                  <span className="w-16 shrink-0 text-right text-muted-foreground">{formatKES(value)}</span>
                </div>
              ))}
              {kindTotals.length === 0 && <p className="text-xs text-muted-foreground">No stops yet.</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Search className="size-4" /> Add a stop</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            className="h-10"
            aria-label="Search listings"
            placeholder="Search real places in Kenya…"
            value={addTerm}
            onChange={e => setAddTerm(e.target.value)}
          />
          {addTerm && (
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {results?.slice(0, 12).map(l => (
                <div key={l._id} className="flex items-center gap-3 rounded-md border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.location} · {formatKES(l.price)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => addFromListing(l.name, l.location, l.price, kindFromVertical(l.vertical), l.lat, l.lng)}>
                    <Plus className="size-3.5" /> Add
                  </Button>
                </div>
              ))}
              {results && results.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">No matches.</p>}
              {!results && <p className="p-3 text-center text-sm text-muted-foreground">Searching…</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {onSave && (
        <Button size="lg" disabled={!stops.length} onClick={() => onSave(stops)}>Save this trip</Button>
      )}
    </div>
  )
})
