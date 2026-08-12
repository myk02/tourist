'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SignInButton, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Plus, RefreshCw, Search, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatKES, type Listing } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { ListingImage } from './shared'
import { ItineraryEditor, type ItineraryEditorHandle } from './itinerary-editor'
import type { Stop } from './types'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'stays', label: 'Stays' },
  { id: 'experiences', label: 'Experiences' },
  { id: 'transport', label: 'Transport' },
] as const

function kindFromVertical(vertical: string) {
  if (vertical === 'stays') return 'Stay'
  if (vertical === 'attractions' || vertical === 'things-to-do') return 'Experience'
  return 'Transport'
}

export function ManualPlanner() {
  const { isSignedIn } = useUser()
  const router = useRouter()
  const create = useMutation(api.trips.create)
  const allListings = useQuery(api.listings.list, {})
  const signInRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<ItineraryEditorHandle>(null)
  const pendingItemsRef = useRef<Stop[] | null>(null)
  const [pendingSave, setPendingSave] = useState(false)
  const [category, setCategory] = useState<'all' | 'stays' | 'experiences' | 'transport'>('all')
  const [term, setTerm] = useState('')
  // Briefly flash a "Refreshing…" chip whenever the listings query delivers a
  // NEW value after the initial load (e.g. a live scrape update), so returning
  // users can see the rail refresh. Convex keeps the previous result cached,
  // so a changed reference means fresh data actually arrived.
  const [refreshing, setRefreshing] = useState(false)
  const firstLoadRef = useRef(true)
  const prevListingsRef = useRef<typeof allListings>(undefined)

  useEffect(() => {
    if (isSignedIn && pendingSave && pendingItemsRef.current) {
      setPendingSave(false)
      save(pendingItemsRef.current)
    }
  }, [isSignedIn, pendingSave])

  useEffect(() => {
    if (allListings === undefined) return
    if (firstLoadRef.current) {
      // Initial resolution — the skeleton already covers this.
      firstLoadRef.current = false
      prevListingsRef.current = allListings
      return
    }
    if (prevListingsRef.current !== allListings) {
      prevListingsRef.current = allListings
      setRefreshing(true)
      const t = setTimeout(() => setRefreshing(false), 1500)
      return () => clearTimeout(t)
    }
  }, [allListings])

  const filtered = useMemo(() => {
    if (!allListings) return undefined
    let items = [...allListings]
    if (category === 'stays') items = items.filter(l => l.vertical === 'stays')
    if (category === 'experiences') items = items.filter(l => l.vertical === 'attractions' || l.vertical === 'things-to-do')
    if (category === 'transport') items = items.filter(l => l.vertical === 'flights' || l.vertical === 'taxis' || l.vertical === 'cars')
    if (term) {
      const q = term.toLowerCase()
      items = items.filter(l => l.name.toLowerCase().includes(q) || l.location.toLowerCase().includes(q) || l.tags.some(t => t.toLowerCase().includes(q)))
    }
    return items
  }, [allListings, category, term])

  async function save(items: Stop[]) {
    try {
      const id = await create({
        name: 'My Kenya Route',
        destination: [...new Set(items.map(x => x.place.split(',')[0]))].join(', '),
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 86400000 * Math.max(items.length, 1)).toISOString().slice(0, 10),
        budget: 80000,
        totalCost: items.reduce((s, x) => s + x.cost, 0),
        stops: items.map((s, i) => ({
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
        })),
      })
      try { sessionStorage.removeItem('draftItinerary') } catch { /* ignore */ }
      router.push(`/trips/${id}`)
    } catch {
      toast.error('Could not save your trip')
    }
  }

  function handleSave(items: Stop[]) {
    pendingItemsRef.current = items
    if (!isSignedIn) {
      setPendingSave(true)
      signInRef.current?.click()
    } else {
      save(items)
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 lg:grid-cols-[400px_1fr]">
      <SignInButton mode="modal"><div ref={signInRef} style={{ display: 'none' }} /></SignInButton>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Manual planner</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Build your route</h1>
          </div>
          {refreshing && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <RefreshCw className="size-3.5 animate-spin" />
              Refreshing…
            </span>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            aria-label="Search places"
            placeholder="Mara, beach, city…"
            value={term}
            onChange={e => setTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                category === c.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
          {filtered?.map(l => (
            <Card key={l._id} className="group overflow-hidden p-0">
              <button onClick={() => addFromListing(l)} className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-secondary/50">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-md">
                  <ListingImage src={l.image} alt={l.name} fill className="object-cover" sizes="64px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{l.location}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    <span className="font-semibold">{formatKES(l.price)}</span>
                    <span className="flex items-center gap-0.5 text-muted-foreground"><Star className="size-3 fill-accent text-accent" />{l.rating}</span>
                  </div>
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/30 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Plus className="size-4" />
                </span>
              </button>
            </Card>
          ))}
          {filtered && filtered.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No places match.</p>}
          {!filtered && (
            <>
              {Array(6).fill(null).map((_, i) => (
                <Card key={i} className="overflow-hidden p-0">
                  <div className="flex w-full items-center gap-3 p-3">
                    <Skeleton className="size-16 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                </Card>
              ))}
              <p className="text-center text-xs text-muted-foreground">Loading places…</p>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Your draft</h2>
        <ItineraryEditor
          ref={editorRef}
          initial={[]}
          budget={80000}
          title="My Kenya Route"
          storageKey="draftItinerary"
          onSave={handleSave}
        />
      </div>
    </div>
  )

  function addFromListing(item: Listing) {
    editorRef.current?.addStop({
      title: item.name,
      place: item.location,
      cost: item.price,
      kind: kindFromVertical(item.vertical),
      lat: item.lat,
      lng: item.lng,
    })
    toast.success(`${item.name} added`)
  }
}
