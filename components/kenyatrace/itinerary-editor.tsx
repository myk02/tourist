'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
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
import { SuggestedBadge, VerifiedBadge } from '@/components/ui/kt/badges'
import { PillToggle } from '@/components/ui/kt/pill-toggle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Car, Clock, GripVertical, Lock, LockOpen, Pencil, Plus, RefreshCw, Route, Search, TriangleAlert, Wallet, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatKES } from '@/lib/kenya-data'
import { KIND_CHIP, kindChip } from '@/lib/kind'
import { dayOptimizationHint } from '@/lib/route-optimize'
import { cn } from '@/lib/utils'
import type { Stop } from './types'

export const KIND_STYLE: Record<string, string> = KIND_CHIP

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
  // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const km = distanceKm(a.lat, a.lng, b.lat, b.lng)
  const hours = Math.max(km / 45, 0.25)
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h ? `${h}h ` : ''}${m}min · ${Math.round(km)} km`
}

function formatMins(mins: number) {
  if (!mins || mins < 60) return `${mins || 0} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function kindFromVertical(vertical: string) {
  if (vertical === 'stays') return 'Stay'
  if (vertical === 'attractions') return 'Experience'
  if (vertical === 'flights' || vertical === 'taxis' || vertical === 'cars') return 'Transport'
  return 'Experience'
}

/** Stable per-row identity: titles can repeat, so keys must not derive from them. */
function stopKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function ensureKeys(stops: Stop[]): Stop[] {
  return stops.map(s => (s.key ? s : { ...s, key: stopKey() }))
}

function SortableStopRow({ stop, active, editing, readOnly, days, onEditingChange, onUpdate, onRemove, onMoveDay }: {
  stop: Stop
  active?: boolean
  editing: boolean
  readOnly?: boolean
  days: number[]
  onEditingChange: (editing: boolean) => void
  onUpdate: (patch: Partial<Stop>) => void
  onRemove: () => void
  onMoveDay: (day: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.key! })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex flex-wrap items-center gap-3 rounded-none border bg-card p-3 transition-colors', isDragging && 'z-10 opacity-80 shadow-lift', active && 'border-primary ring-2 ring-primary/20')}
    >
      {!readOnly && (
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-none bg-primary/10 text-xs font-bold text-primary">{stop.time}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('font-semibold', stop.locked && 'opacity-60')}>{stop.title}</p>
          <Badge className={cn('shrink-0 text-[10px]', kindChip(stop.kind))}>{stop.kind}</Badge>
          {stop.verified ? (
            <VerifiedBadge className="shrink-0 text-[10px]" />
          ) : stop.source === 'gap' ? (
            <SuggestedBadge className="shrink-0 text-[10px]" />
          ) : null}
          {stop.locked && <Lock className="size-3 shrink-0 text-primary" />}
        </div>
        <p className="truncate text-sm text-muted-foreground">{stop.place}</p>
        {stop.reason && <p className="mt-0.5 text-xs text-muted-foreground/80">{stop.reason}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {editing ? (
          <>
            <Input
              type="time"
              className="h-8 w-24 sm:w-28"
              value={stop.time}
              aria-label="Time"
              onChange={e => onUpdate({ time: e.target.value })}
            />
            <Input
              type="number"
              className="h-8 w-24 sm:w-28"
              value={stop.cost}
              aria-label="Cost"
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                if (!Number.isNaN(n)) onUpdate({ cost: n })
              }}
            />
            <Input
              type="number"
              className="h-8 w-24 sm:w-28"
              value={stop.duration ?? 60}
              min={5}
              max={1440}
              aria-label="Duration in minutes"
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                if (!Number.isNaN(n)) onUpdate({ duration: n })
              }}
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
      {!readOnly && (
        <div className="flex items-center gap-0.5">
          {days.length > 1 && (
            <select
              value={stop.day}
              onChange={e => onMoveDay(Number(e.target.value))}
              aria-label={`Move ${stop.title} to another day`}
              className="h-9 max-w-24 rounded-none border border-border bg-background px-1 text-xs text-muted-foreground"
            >
              {days.map(d => <option key={d} value={d}>Day {d}</option>)}
            </select>
          )}
          <Button size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label={stop.locked ? 'Unlock this stop' : 'Lock this stop'} onClick={() => onUpdate({ locked: !stop.locked })}>
            {stop.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label="Edit time and cost" onClick={() => onEditingChange(!editing)}>
            {editing ? <X className="size-4" /> : <Pencil className="size-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="min-h-11 min-w-11 text-destructive" aria-label={`Remove ${stop.title}`} onClick={onRemove}>
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

/** Day header summary: stop count, cost and route distance in one glance. */
function DaySummary({ stops, cost, travel }: { stops: Stop[]; cost: number; travel?: { km: number; mins: number } }) {
  const parts = [
    `${stops.length} stop${stops.length === 1 ? '' : 's'}`,
    formatKES(cost),
  ]
  if (travel && travel.km > 0) parts.push(`${travel.km} km · ~${formatMins(travel.mins)}`)
  return <span className="text-sm text-muted-foreground">· {parts.join(' · ')}</span>
}

function TravelTime({ a, b }: { a: Stop; b: Stop }) {  // Prefer the real routed travel time computed at plan time; fall back to the
  // straight-line estimate so saved trips without routed data still show rows.
  const label = b.travelKm != null && b.travelMins != null ? `${b.travelKm} km · ~${formatMins(b.travelMins)}` : travelRow(a, b)
  const routed = b.travelKm != null && b.travelMins != null
  if (!label) return null
  return (
    <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
      <span className="h-4 w-px bg-border" />
      <Car className="size-3.5" />
      <span>{label}</span>
      {routed && (
        <span className={cn('rounded-none px-1.5 py-px text-[10px] font-medium', b.travelRouted ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground')}>
          {b.travelRouted ? 'routing' : 'estimate'}
        </span>
      )}
    </div>
  )
}

export type ItineraryEditorHandle = { addStop: (stop: Omit<Stop, 'day' | 'time'>) => void }

export const ItineraryEditor = forwardRef<ItineraryEditorHandle, {
  initial?: Stop[]
  budget?: number
  title?: string
  defaultMobileView?: 'list' | 'map'
  onSave?: (stops: Stop[]) => void
  onReplanDay?: (day: number, stops: Stop[]) => Promise<Stop[]>
  onChange?: (stops: Stop[]) => void
  readOnly?: boolean
}>(function ItineraryEditor({ initial = [], budget = 80000, title = 'Kenya Highlights', defaultMobileView = 'list', onSave, onReplanDay, onChange, readOnly = false }, ref) {
  // Initialize from the prop only — reading storage here would make the
  // client's first render differ from the server's (SSR hydration mismatch).
  const [stops, setStops] = useState<Stop[]>(() => ensureKeys(initial))
  // True once the component has mounted, so `onChange` is only surfaced to the
  // parent after the first paint (avoids a setState-during-render warning).
  const [mounted, setMounted] = useState(false)
  const [activeDay, setActiveDay] = useState<string>('all')
  // Editing is keyed by the stop's stable identity, so duplicate titles or a
  // reorder can never point edits at the wrong row.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [addTerm, setAddTerm] = useState('')
  // Search only fires 300ms after typing settles — every keystroke used to
  // hit the listings query.
  const [searchTerm, setSearchTerm] = useState('')
  const [replanningDay, setReplanningDay] = useState<number | null>(null)
  const [hoveredStop, setHoveredStop] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'map'>(defaultMobileView)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(addTerm), 300)
    return () => clearTimeout(t)
  }, [addTerm])

  useImperativeHandle(ref, () => ({
    addStop: (stop) => setStops(prev => {
      const lastDay = prev.length ? Math.max(...prev.map(s => s.day)) : 1
      return [...prev, { ...stop, day: lastDay, time: '09:00', key: stopKey() }]
    }),
  }), [])

  const results = useQuery(api.listings.searchAll, { term: searchTerm || undefined })

  // Surface every change to the parent (e.g. the journey's draft), but only
  // after the component has mounted so the first onChange doesn't fire during
  // the initial render.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    setMounted(true)
  }, [])
  useEffect(() => {
    if (!mounted) return
    onChangeRef.current?.(stops)
  }, [mounted, stops])

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

  // Per-day route totals for the day headers ("Day 2 · 3 stops · 48 km · ~1h 20m").
  // Prefers routed travelKm/Mins computed at plan time; falls back to the same
  // straight-line estimate travelRow uses so saved trips without routed data
  // still show a number instead of nothing.
  const dayTravel = useMemo(() => {
    const map = new Map<number, { km: number; mins: number }>()
    for (const [, dayStops] of days) {
      let km = 0
      let mins = 0
      for (let i = 1; i < dayStops.length; i++) {
        const a = dayStops[i - 1]
        const b = dayStops[i]
        const legKm = b.travelKm ?? (a.lat != null && a.lng != null && b.lat != null && b.lng != null
          ? distanceKm(a.lat, a.lng, b.lat, b.lng)
          : 0)
        const legMins = b.travelMins ?? Math.max((legKm / 45) * 60, legKm > 0 ? 15 : 0)
        km += legKm
        mins += legMins
      }
      map.set(dayStops[0]?.day ?? 0, { km: Math.round(km), mins: Math.round(mins) })
    }
    return map
  }, [days])

  const kindTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of stops) map.set(s.kind, (map.get(s.kind) ?? 0) + s.cost)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [stops])

  // Per-day zig-zag detection: which days would get meaningfully shorter if
  // their stops were reordered (locked stops respected).
  const [dismissedHints, setDismissedHints] = useState<Set<number>>(new Set())
  const dayHints = useMemo(() => {
    const map = new Map<number, NonNullable<ReturnType<typeof dayOptimizationHint<Stop>>>>()
    if (readOnly) return map
    for (const [day, dayStops] of days) {
      const hint = dayOptimizationHint(dayStops)
      if (hint) map.set(day, hint)
    }
    return map
  }, [days, readOnly])

  function optimizeDay(day: number) {
    const dayStops = stops.filter(s => s.day === day)
    const hint = dayOptimizationHint(dayStops)
    if (!hint) return
    undoRef.current = stops
    const ordered = hint.order.map(i => dayStops[i])
    setStops(prev => {
      const firstIdx = prev.findIndex(s => s.day === day)
      if (firstIdx < 0) return prev
      return [...prev.slice(0, firstIdx), ...ordered, ...prev.slice(firstIdx).filter(s => s.day !== day)]
    })
    toastWithUndo(`Day ${day} reordered — ~${Math.round(hint.savingsKm)} km shorter`, `Day ${day} reordered`)
  }

  const mapData = useMemo(() => {
    const day = activeDay === 'all' ? null : parseInt(activeDay, 10)
    const filtered = day === null ? stops : stops.filter(s => s.day === day)
    // Preserve the on-screen order (day-major, then the user's arrangement).
    const ordered = [...filtered].sort((a, b) => a.day - b.day)
    const dayIndex = new Map<number, number>()
    const points: { id: string; name: string; location: string; lat: number; lng: number }[] = []
    const route: [number, number][] = []
    // Point ids are the stop's stable key — identical to the DOM row ids
    // (`stop-{key}`) so marker clicks/hover scroll to exactly the right stop.
    for (const s of ordered) {
      // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
      if (s.lat != null && s.lng != null) {
        points.push({ id: s.key!, name: s.title, location: s.place, lat: s.lat, lng: s.lng })
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

  function patchStop(key: string, patch: Partial<Stop>) {
    setStops(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)))
  }

  // Screen-reader announcements for reorder/move/optimize (drag gives no feedback).
  const [announcement, setAnnouncement] = useState('')

  /** Snapshot/restore for the destructive reorders (optimize), with Undo toast. */
  const undoRef = useRef<Stop[] | null>(null)
  function restoreUndo(label: string) {
    const prev = undoRef.current
    if (!prev) return
    undoRef.current = null
    setStops(prev)
    setAnnouncement(label)
    toast.success(label)
  }
  function toastWithUndo(message: string, announce: string) {
    setAnnouncement(announce)
    toast.success(message, { action: { label: 'Undo', onClick: () => restoreUndo(announce) } })
  }

  /** Keyboard/mobile-friendly cross-day move — the drag-free alternative to dnd. */
  function moveStop(key: string, day: number) {
    const target = stops.find(s => s.key === key)
    if (!target || target.day === day) return
    setStops(prev => prev.map(s => (s.key === key ? { ...s, day } : s)))
    setAnnouncement(`Moved ${target.title} to day ${day}`)
  }

  function removeStop(key: string) {
    setStops(prev => prev.filter(s => s.key !== key))
    setEditingKey(prev => (prev === key ? null : prev))
  }

  /**
   * Reorders stops within each day by a greedy nearest-neighbour walk over
   * their coordinates, cutting backtracking between consecutive stops while
   * keeping every day's route and day boundaries intact. Locked stops stay
   * pinned in place; only unlocked stops are reordered between them.
   */
  function optimizeRoute() {
    if (stops.length < 2) return
    if (stops.some(s => s.locked)) {
      toast.error('Unlock stops first to optimize — locked stops stay pinned')
      return
    }
    undoRef.current = stops
    setStops(prev => {
      const byDay = new Map<number, Stop[]>()
      for (const s of prev) {
        const arr = byDay.get(s.day) ?? []
        arr.push(s)
        byDay.set(s.day, arr)
      }
      const result: Stop[] = []
      for (const [, dayStops] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
        // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
        const withCoords = dayStops.filter(s => s.lat != null && s.lng != null)
        const withoutCoords = dayStops.filter(s => s.lat == null || s.lng == null)
        const ordered: Stop[] = []
        const remaining = [...withCoords]
        while (remaining.length) {
          if (ordered.length === 0) { ordered.push(remaining.shift()!); continue }
          const last = ordered[ordered.length - 1]
          let best = 0
          let bestDist = Infinity
          for (let i = 0; i < remaining.length; i++) {
            const d = distanceKm(last.lat!, last.lng!, remaining[i].lat!, remaining[i].lng!)
            if (d < bestDist) { bestDist = d; best = i }
          }
          ordered.push(remaining.splice(best, 1)[0])
        }
        result.push(...ordered, ...withoutCoords)
      }
      return result
    })
    toastWithUndo('Route optimized — shortest path per day', 'Route optimized')
  }

  function handleDragEnd(day: number, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const moved = stops.find(s => s.key === active.id)
    setStops(prev => {
      const dayStops = prev.filter(s => s.day === day)
      const from = dayStops.findIndex(s => s.key === active.id)
      const to = dayStops.findIndex(s => s.key === over.id)
      if (from < 0 || to < 0) return prev
      const reordered = [...dayStops]
      const [m] = reordered.splice(from, 1)
      reordered.splice(to, 0, m)
      const next = [...prev]
      let seen = 0
      for (let i = 0; i < next.length; i++) {
        if (next[i].day === day) next[i] = reordered[seen++]
      }
      return next
    })
    if (moved) setAnnouncement(`Moved ${moved.title} to position ${stops.filter(s => s.day === day).findIndex(s => s.key === over.id) + 1} on day ${day}`)
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
            result.push({ ...next[newIdx++], day: old.day, locked: false, key: stopKey() })
          }
        }
        while (newIdx < next.length) result.push({ ...next[newIdx++], day, key: stopKey() })
        const out: Stop[] = []
        let seen = 0
        for (const s of prev) {
          if (s.day === day) out.push(result[seen++])
          else out.push(s)
        }
        return out
      })
      toast.success(`Day ${day} re-planned`)
    } catch (error) {
      // /api/plan composes specific rejections (over budget, origin drift) —
      // surface them instead of a generic failure.
      toast.error(error instanceof Error && error.message ? error.message : 'Could not re-plan this day')
    } finally {
      setReplanningDay(null)
    }
  }

  function addFromListing(listing: { _id: string; name: string; location: string; price: number; vertical: string; lat: number | undefined; lng: number | undefined; image?: string }) {
    const targetDay = activeDay === 'all' ? (days.length ? days[days.length - 1][0] : 1) : parseInt(activeDay, 10)
    const dayStops = stops.filter(s => s.day === targetDay)
    setStops(prev => [...prev, {
      day: targetDay,
      time: dayStops.length ? '15:00' : '09:00',
      title: listing.name,
      place: listing.location,
      cost: listing.price,
      kind: kindFromVertical(listing.vertical),
      lat: listing.lat,
      lng: listing.lng,
      image: listing.image,
      // Search results are real catalog rows — mark them verified.
      verified: true,
      source: 'catalog' as const,
      listingId: listing._id,
      vertical: listing.vertical,
      key: stopKey(),
    }])
    toast.success(`${listing.name} added to day ${targetDay}`)
  }

  /** Amber nudge shown above a day whose stop order visibly zig-zags. */
  function renderDayHint(day: number) {
    const hint = dayHints.get(day)
    if (!hint || dismissedHints.has(day)) return null
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-none border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        <TriangleAlert className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          This day backtracks — reordering the stops makes it ~{Math.round(hint.savingsKm)} km ({Math.round(hint.savingsPct * 100)}%) shorter.
        </span>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 border-amber-500/40 bg-transparent text-xs hover:bg-amber-500/15 hover:text-inherit" onClick={() => optimizeDay(day)}>
          <Route className="size-3.5" />Optimize day
        </Button>
        <button type="button" aria-label="Dismiss hint" onClick={() => setDismissedHints(prev => new Set(prev).add(day))} className="text-amber-700/70 transition-colors hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100">
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  function renderStopList(day: number) {
    const dayStops = stops.filter(s => s.day === day)
    if (dayStops.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">No stops yet — add some below or with the search.</p>
    return (
      <div className="flex flex-col gap-1.5">
        {renderDayHint(day)}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={e => handleDragEnd(day, e)}
        >
          <SortableContext items={dayStops.map(s => s.key!)} strategy={verticalListSortingStrategy}>
            {dayStops.map((stop, i) => (
              <div
                key={stop.key}
                id={`stop-${stop.key}`}
                onMouseEnter={() => setHoveredStop(stop.key!)}
                onMouseLeave={() => setHoveredStop(null)}
                className="flex flex-col gap-1.5"
              >
                {i > 0 && <TravelTime a={dayStops[i - 1]} b={stop} />}
                <SortableStopRow
                  stop={stop}
                  active={hoveredStop === stop.key}
                  editing={editingKey === stop.key}
                  readOnly={readOnly}
                  days={days.map(([d]) => d)}
                  onEditingChange={editing => setEditingKey(editing ? stop.key! : null)}
                  onUpdate={patch => patchStop(stop.key!, patch)}
                  onRemove={() => removeStop(stop.key!)}
                  onMoveDay={day => moveStop(stop.key!, day)}
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
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">{days.length}-day route</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <Button variant="outline" size="sm" className="gap-1.5" disabled={stops.length < 2} onClick={optimizeRoute} title="Reorder stops in each day to minimize backtracking">
              <Route className="size-3.5" />
              Optimize route
            </Button>
          )}
          <Badge variant={total > budget ? 'destructive' : 'secondary'}>
            {total > budget ? `${formatKES(total - budget)} over` : `${formatKES(budget - total)} remaining`}
          </Badge>
          {readOnly && <Badge variant="outline" className="border-primary/40 text-primary">View-only</Badge>}
        </div>
      </div>

      <Tabs value={activeDay} onValueChange={v => { setActiveDay(v); setHoveredStop(null) }}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="all">All days</TabsTrigger>
            {days.map(([day]) => <TabsTrigger key={day} value={String(day)}>Day {day}</TabsTrigger>)}
          </TabsList>
          {onReplanDay && activeDay !== 'all' && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={replanningDay !== null} onClick={() => replanDay(parseInt(activeDay, 10))}>
                <RefreshCw className={cn('size-3.5', replanningDay === parseInt(activeDay, 10) && 'animate-spin')} />
                Re-plan this day
              </Button>
              <p className="w-full text-xs text-muted-foreground md:w-auto">
                Lock any stops you want to keep — re-planning replaces only the unlocked ones.
              </p>
            </>
          )}
        </div>
        <div className="mt-3 lg:hidden">
          <PillToggle
            label="Itinerary view"
            value={mobileView}
            onChange={setMobileView}
            options={[
              { value: 'list', label: 'List' },
              { value: 'map', label: 'Map' },
            ]}
          />
        </div>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className={cn('min-w-0', mobileView === 'map' && 'hidden lg:block')}>
            <TabsContent value="all">
              <div className="flex flex-col gap-6">
                {days.map(([day]) => (
                  <div key={day} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-none bg-primary text-xs font-bold text-primary-foreground shadow-xs">{day}</span>
                      <h3 className="font-semibold">Day {day}</h3>
                      <DaySummary stops={stops.filter(s => s.day === day)} cost={dayTotals.get(day) ?? 0} travel={dayTravel.get(day)} />
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
                  <span className="w-24 shrink-0">{kind}</span>
                  <Progress className="h-1.5 flex-1" value={Math.min((value / Math.max(total, 1)) * 100, 100)} />
                  <span className="w-16 shrink-0 text-right text-muted-foreground">{formatKES(value)}</span>
                </div>
              ))}
              {kindTotals.length === 0 && <p className="text-xs text-muted-foreground">No stops yet.</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {!readOnly && <Card>
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
                <div key={l._id} className="flex items-center gap-3 rounded-none border p-2.5 transition-colors hover:border-primary/30">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.location} · {formatKES(l.price)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => addFromListing({ _id: l._id, name: l.name, location: l.location, price: l.price, vertical: l.vertical, lat: l.lat, lng: l.lng, image: l.image })}>
                    <Plus className="size-3.5" /> Add
                  </Button>
                </div>
              ))}
              {results && results.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">No matches.</p>}
              {!results && <p className="p-3 text-center text-sm text-muted-foreground">Searching…</p>}
            </div>
          )}
        </CardContent>
      </Card>}

      {onSave && !readOnly && (
        <Button size="lg" disabled={!stops.length} onClick={() => onSave(stops)}>Save this trip</Button>
      )}
    </div>
  )
})
