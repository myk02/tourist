'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SignInButton, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ArrowRight, Heart, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatKES } from '@/lib/kenya-data'
import type { Doc } from '@/convex/_generated/dataModel'
import { ItineraryEditor, KIND_STYLE } from './itinerary-editor'
import type { Generated, Stop } from './types'

function isVerified(title: string, place: string, listings: Doc<'listings'>[] | undefined): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const t = norm(title)
  return (listings ?? []).some(l => {
    const n = norm(l.name)
    if (n.length < 4) return false
    if (n.includes(t) || (t.length >= 4 && t.includes(n))) return true
    return false
  })
}

const DESTINATIONS = ['Maasai Mara', 'Nairobi', 'Lake Naivasha', 'Amboseli', 'Diani & Coast', 'Lamu', 'Watamu', 'Samburu', 'Mount Kenya']
const INTERESTS = ['Wildlife', 'Food', 'Culture', 'Beach', 'Adventure', 'Luxury', 'Local life']
const PACES = [
  { value: 'relaxed', label: 'Relaxed', hint: 'Max 3 stops a day' },
  { value: 'balanced', label: 'Balanced', hint: '3–4 stops a day' },
  { value: 'full', label: 'Full days', hint: '4–6 stops a day' },
] as const
const BUDGETS = [20000, 50000, 100000, 200000]
const KINDS = ['Stay', 'Experience', 'Transport', 'Food']

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function AIPlanner() {
  const router = useRouter()
  const create = useMutation(api.trips.create)
  const { isSignedIn } = useUser()
  const me = useQuery(api.users.me)
  const allListings = useQuery(api.listings.list, {})
  const signInRef = useRef<HTMLDivElement>(null)

  const [destinations, setDestinations] = useState<string[]>(['Maasai Mara', 'Lake Naivasha'])
  const [interests, setInterests] = useState<string[]>(['Wildlife', 'Food'])
  const [pace, setPace] = useState<'relaxed' | 'balanced' | 'full'>('balanced')
  const [budget, setBudget] = useState(100000)
  const [startDate, setStartDate] = useState('2026-08-18')
  const [endDate, setEndDate] = useState('2026-08-23')
  const [extra, setExtra] = useState('')

  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    const prefs = me?.preferences
    if (prefilled || !prefs) return
    setPrefilled(true)
    if (prefs.destinations?.length) {
      const valid = prefs.destinations.filter(d => DESTINATIONS.includes(d))
      if (valid.length) setDestinations(valid.slice(0, 2))
    }
    if (prefs.interests?.length) {
      const valid = prefs.interests.filter(i => INTERESTS.includes(i))
      if (valid.length) setInterests(valid.slice(0, 3))
    }
    if (prefs.pace === 'relaxed' || prefs.pace === 'full' || prefs.pace === 'balanced') setPace(prefs.pace)
    if (prefs.budget) setBudget(prefs.budget)
  }, [me, prefilled])

  const [generated, setGenerated] = useState<Generated | null>(null)

  useEffect(() => {
    if (!generated || !allListings) return
    setGenerated(g => g && g.stops.some(s => s.verified === undefined) ? { ...g, stops: g.stops.map(s => s.verified === undefined ? { ...s, verified: isVerified(s.title, s.place, allListings) } : s) } : g)
  }, [generated, allListings])

  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [stage, setStage] = useState<'brief' | 'discovery' | 'arrange'>('brief')
  const [loading, setLoading] = useState(false)

  // A previously-saved draft (sessionStorage) can be resumed instead of lost.
  const [draftStops, setDraftStops] = useState<Stop[] | null>(null)
  const [draftMeta, setDraftMeta] = useState<{ name: string; destination: string; summary: string } | null>(null)

  useEffect(() => {
    if (stage !== 'brief' || generated) return
    try {
      const raw = sessionStorage.getItem('aiItineraryDraft')
      if (!raw) return
      const stops = JSON.parse(raw) as Stop[]
      if (!Array.isArray(stops) || stops.length === 0) return
      setDraftStops(stops)
      try {
        const metaRaw = sessionStorage.getItem('aiItineraryMeta')
        if (metaRaw) setDraftMeta(JSON.parse(metaRaw))
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, [stage, generated])

  function resumeDraft() {
    if (!draftStops) return
    setGenerated({
      name: draftMeta?.name || 'Draft itinerary',
      destination: draftMeta?.destination || '',
      summary: draftMeta?.summary || 'Resumed from your last session.',
      stops: draftStops,
    })
    setFavorites(new Set())
    setDraftStops(null)
    setDraftMeta(null)
    setStage('arrange')
  }

  function discardDraft() {
    try {
      sessionStorage.removeItem('aiItineraryDraft')
      sessionStorage.removeItem('aiItineraryMeta')
    } catch { /* ignore */ }
    setDraftStops(null)
    setDraftMeta(null)
  }

  function goArrange() {
    if (!generated) return
    // Hearted stops flow into the itinerary; if none were hearted, keep all.
    const hearted = generated.stops.filter(s => favorites.has(s.title))
    const keep = hearted.length > 0 ? hearted : generated.stops
    setGenerated(g => (g ? { ...g, stops: keep } : g))
    setStage('arrange')
  }

  const [pendingSave, setPendingSave] = useState(false)
  const pendingItemsRef = useRef<Stop[] | null>(null)
  useEffect(() => {
    if (isSignedIn && pendingSave && pendingItemsRef.current) {
      setPendingSave(false)
      save(pendingItemsRef.current)
    }
  }, [isSignedIn, pendingSave])

  async function build() {
    if (destinations.length === 0) { toast.error('Pick at least one destination'); return }
    setLoading(true)
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          destinations: destinations.join(', '),
          startDate,
          endDate,
          budget,
          interests,
          pace,
          extra,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      try {
        sessionStorage.removeItem('aiItineraryDraft')
        sessionStorage.setItem('aiItineraryMeta', JSON.stringify({ name: data.name, destination: data.destination, summary: data.summary }))
      } catch { /* ignore */ }
      setGenerated(data)
      setFavorites(new Set())
      setDraftStops(null)
      setDraftMeta(null)
      setStage('discovery')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not build your trip')
    } finally {
      setLoading(false)
    }
  }

  async function replanDay(day: number, dayStops: Stop[]): Promise<Stop[]> {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'day',
        day,
        destinations: destinations.join(', '),
        budget,
        interests,
        pace,
        extra,
        keptStops: dayStops.filter(s => s.locked).map(s => ({ title: s.title, place: s.place })),
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return data.stops as Stop[]
  }

  async function save(stops: Stop[]) {
    if (!generated) return
    try {
      const id = await create({
        name: generated.name,
        destination: generated.destination,
        startDate,
        endDate,
        budget,
        totalCost: stops.reduce((s, x) => s + x.cost, 0),
        stops: stops.map((s, i) => ({
          name: s.title,
          place: s.place,
          day: s.day,
          time: s.time,
          cost: s.cost,
          kind: s.kind,
          order: i,
          lat: s.lat,
          lng: s.lng,
          locked: s.locked,
          reason: s.reason,
          verified: s.verified,
          duration: s.duration,
        })),
      })
      try {
        sessionStorage.removeItem('aiItineraryDraft')
        sessionStorage.removeItem('aiItineraryMeta')
      } catch { /* ignore */ }
      toast.success('Trip saved')
      router.push(`/trips/${id}`)
    } catch {
      toast.error('Could not save your trip')
    }
  }

  function handleSave(stops: Stop[]) {
    pendingItemsRef.current = stops
    if (!isSignedIn) {
      setPendingSave(true)
      signInRef.current?.click()
    } else {
      save(stops)
    }
  }

  const groups = useMemo(() => {
    if (!generated) return []
    return KINDS.map(kind => ({ kind, stops: generated.stops.filter(s => s.kind === kind) })).filter(g => g.stops.length > 0)
  }, [generated])

  function toggleFavorite(title: string) {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[380px_1fr]">
      <SignInButton mode="modal"><div ref={signInRef} style={{ display: 'none' }} /></SignInButton>

      {draftStops && !generated && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 lg:col-span-2">
          <div>
            <p className="font-semibold">You have an unfinished itinerary</p>
            <p className="text-sm text-muted-foreground">{draftStops.length} stop{draftStops.length === 1 ? '' : 's'} saved from a previous session — pick up where you left off.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={resumeDraft}>Resume editing</Button>
            <Button variant="outline" onClick={discardDraft}>Discard draft</Button>
          </div>
        </div>
      )}

      <Card className="h-fit">
        <CardHeader>
          <Badge className="w-fit"><Sparkles /> AI planner</Badge>
          <CardTitle className="font-serif text-3xl">Tell us your kind of Kenya</CardTitle>
          <CardDescription>Real places, real prices, real days.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div>
            <label className="text-sm font-medium">Where to</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {DESTINATIONS.map(d => (
                <Chip key={d} active={destinations.includes(d)} onClick={() => setDestinations(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}>{d}</Chip>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Into</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTERESTS.map(i => (
                <Chip key={i} active={interests.includes(i)} onClick={() => setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}>{i}</Chip>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Pace</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PACES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPace(p.value)}
                  className={cn('rounded-md border px-2 py-2 text-sm transition-colors', pace === p.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground')}
                >
                  <span className="block font-medium">{p.label}</span>
                  <span className={cn('block text-[10px]', pace === p.value ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{p.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Budget</label>
              <span className="text-sm font-semibold text-primary">{formatKES(budget)}</span>
            </div>
            <Slider
              className="mt-3"
              min={20000}
              max={200000}
              step={10000}
              value={[budget]}
              onValueChange={v => setBudget(Array.isArray(v) ? v[0] : v)}
              aria-label="Budget"
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              {BUDGETS.map(b => (
                <button key={b} type="button" onClick={() => setBudget(b)} className="transition-colors hover:text-foreground">{formatKES(b)}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Start date</label>
              <Input type="date" className="mt-1" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">End date</label>
              <Input type="date" className="mt-1" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Anything else (optional)</label>
            <Textarea className="mt-1" value={extra} onChange={e => setExtra(e.target.value)} placeholder="A special stay, a birthday, a slow morning…" />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={build} disabled={loading}>{loading ? 'Planning…' : 'Build itinerary'}</Button>
        </CardFooter>
      </Card>

      {stage === 'discovery' && generated && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Your brief, drafted</p>
            <h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight">{generated.name}</h2>
            <p className="mt-2 text-muted-foreground">{generated.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">These are suggestions from your brief — heart what you love, then arrange them into days. Nothing is booked yet.</p>
          </div>

          <div className="flex flex-col gap-6">
            {groups.map(group => (
              <div key={group.kind}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.kind}</h3>
                <div className="flex flex-col gap-3">
                  {group.stops.map((stop, i) => {
                    const saved = favorites.has(stop.title)
                    return (
                      <Card key={`${stop.title}-${i}`} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{stop.title}</p>
                              <Badge className={cn('text-[10px]', KIND_STYLE[stop.kind] ?? 'bg-secondary text-muted-foreground')}>{stop.kind}</Badge>
                              {stop.verified
                                ? <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">Verified · our database</Badge>
                                : <Badge variant="outline" className="text-[10px] text-muted-foreground">Suggested · from your brief</Badge>}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">Day {stop.day} · {stop.time} · {stop.place}</p>
                            {stop.reason && <p className="mt-1.5 text-sm italic text-muted-foreground/80">“{stop.reason}”</p>}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span className="text-sm font-semibold">{formatKES(stop.cost)}</span>
                            <button
                              aria-label={saved ? 'Remove from favourites' : 'Add to favourites'}
                              onClick={() => toggleFavorite(stop.title)}
                              className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                            >
                              <Heart className={cn('size-4', saved && 'fill-red-500 text-red-500')} />
                            </button>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {favorites.size === 0 && (
            <p className="text-sm text-muted-foreground">No favourites yet — all suggestions will be arranged into days. Heart the ones you love to keep only those.</p>
          )}
          <Button size="lg" className="self-start gap-2" onClick={goArrange}>
            Arrange into days <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      {stage === 'arrange' && generated && (
        <div className="flex flex-col gap-4">
          <ItineraryEditor
            initial={generated.stops}
            budget={budget}
            title={generated.name}
            storageKey="aiItineraryDraft"
            defaultMobileView="map"
            onSave={handleSave}
            onReplanDay={replanDay}
          />
        </div>
      )}
    </div>
  )
}
