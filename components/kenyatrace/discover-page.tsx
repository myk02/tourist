'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { SignInButton, useUser } from '@clerk/nextjs'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Skeleton } from '@/components/ui/skeleton'
import { Heart, Image as ImageIcon, LocateFixed, MapPin, RotateCcw, Search, Star, X } from 'lucide-react'
import { categories, formatKES, type Vertical } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { KenyaMap, toPoint } from './kenya-map'
import { ListingImage, SourceBadge, sourceToFilter, type SourceFilterValue } from './shared'

const NEAR_KM = 100

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function formatUpdated(ts: number | null | undefined) {
  if (!ts) return 'Refreshed automatically'
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `Updated ${hours} h ago`
  return `Updated ${Math.round(hours / 24)} d ago`
}

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'recent', label: 'Recently added' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Rating' },
] as const

type SortValue = (typeof SORTS)[number]['value']
type QuickFilter = 'all' | 'rated' | 'budget'
type SourceFilter = SourceFilterValue

const PAGE_SIZE = 12

export function DiscoverPage({ vertical }: { vertical: Vertical }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const urlQ = params.get('q') || ''
  const urlFilter = (params.get('filter') || 'all') as QuickFilter
  const urlRating = parseFloat(params.get('rating') || '0')
  const urlSort = (params.get('sort') || 'recommended') as SortValue
  const urlMin = params.get('min')
  const urlMax = params.get('max')
  const urlNear = params.get('near') === '1'
  const urlSource = (params.get('source') || 'all') as SourceFilter

  const [searchTerm, setSearchTerm] = useState(urlQ)
  const [debouncedSearch, setDebouncedSearch] = useState(urlQ)
  const [activeFilter, setActiveFilter] = useState<QuickFilter>(urlFilter)
  const [rating, setRating] = useState(Number.isFinite(urlRating) ? urlRating : 0)
  const [sort, setSort] = useState<SortValue>(urlSort)
  const [priceRange, setPriceRange] = useState<[number, number] | null>(
    urlMin && urlMax ? [parseInt(urlMin, 10), parseInt(urlMax, 10)] : null,
  )
  const [nearMe, setNearMe] = useState(urlNear)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(urlSource)
  const [locating, setLocating] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const rawItems = useQuery(api.listings.search, { vertical, term: debouncedSearch || undefined })
  const counts = useQuery(api.listings.countByVertical)
  const lastScrapedAt = useQuery(api.listings.lastScraped, { vertical })
  const scrapeAction = useAction(api.scraper.index.searchWithScrape)
  const backfillImages = useMutation(api.listings.backfillImages)
  const [upgrading, setUpgrading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  const { isSignedIn } = useUser()
  const savedListings = useQuery(api.saved.list)
  const saveListing = useMutation(api.saved.save)
  const removeListing = useMutation(api.saved.remove)
  const savedIds = useMemo(() => new Set((savedListings ?? []).map(s => s.listingId)), [savedListings])
  const signInRef = useRef<HTMLDivElement>(null)
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null)

  useEffect(() => {
    if (isSignedIn && pendingSaveId) {
      setPendingSaveId(null)
      saveListing({ listingId: pendingSaveId as Id<'listings'> }).catch(() => toast.error('Could not save this option'))
    }
  }, [isSignedIn, pendingSaveId, saveListing])

  const priceBounds = useMemo(() => {
    if (!rawItems?.length) return { min: 0, max: 50000 }
    const prices = rawItems.map(i => i.price)
    const min = Math.floor(Math.min(...prices) / 100) * 100
    const max = Math.ceil(Math.max(...prices) / 100) * 100
    return { min, max: Math.max(max, min + 1000) }
  }, [rawItems])

  useEffect(() => {
    if (rawItems && priceRange === null && rawItems.length > 0) {
      setPriceRange([priceBounds.min, priceBounds.max])
    }
  }, [rawItems, priceRange, priceBounds])

  const activePrice = priceRange ?? [priceBounds.min, priceBounds.max]
  const priceNarrowed = priceRange !== null && (activePrice[0] > priceBounds.min || activePrice[1] < priceBounds.max)

  const filteredItems = useMemo(() => {
    if (!rawItems) return undefined
    let items = [...rawItems]
    if (activeFilter === 'rated') items = items.filter(i => i.rating >= 4.7)
    if (activeFilter === 'budget') items = items.filter(i => i.price < 15000)
    if (rating > 0) items = items.filter(i => i.rating >= rating)
    items = items.filter(i => i.price >= activePrice[0] && i.price <= activePrice[1])
    if (nearMe && coords) {
      items = items.filter(i => distanceKm(coords.lat, coords.lng, i.lat, i.lng) <= NEAR_KM)
    }
    if (sourceFilter === 'firecrawl') items = items.filter(i => i.source === 'firecrawl')
    if (sourceFilter === 'live') items = items.filter(i => i.source === 'scraper' || i.source === 'wikipedia')
    if (sourceFilter === 'curated') items = items.filter(i => !i.source)
    switch (sort) {
      case 'recent': items.sort((a, b) => (b.scrapedAt ?? b._creationTime) - (a.scrapedAt ?? a._creationTime)); break
      case 'price_asc': items.sort((a, b) => a.price - b.price); break
      case 'price_desc': items.sort((a, b) => b.price - a.price); break
      case 'rating': items.sort((a, b) => b.rating - a.rating); break
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItems, activeFilter, rating, sort, activePrice[0], activePrice[1], nearMe, coords, sourceFilter])

  useEffect(() => {
    const p = new URLSearchParams()
    if (debouncedSearch) p.set('q', debouncedSearch)
    if (activeFilter !== 'all') p.set('filter', activeFilter)
    if (rating > 0) p.set('rating', String(rating))
    if (priceNarrowed) { p.set('min', String(activePrice[0])); p.set('max', String(activePrice[1])) }
    if (nearMe) p.set('near', '1')
    if (sourceFilter !== 'all') p.set('source', sourceFilter)
    if (sort !== 'recommended') p.set('sort', sort)
    const qs = p.toString()
    const target = `/discover/${vertical}${qs ? `?${qs}` : ''}`
    if (target !== window.location.pathname + window.location.search) {
      router.replace(target, { scroll: false })
    }
  }, [debouncedSearch, activeFilter, rating, sort, priceNarrowed, activePrice, nearMe, sourceFilter, vertical, router])

  useEffect(() => {
    setSearchTerm(urlQ)
    setDebouncedSearch(urlQ)
    setActiveFilter(urlFilter)
    setRating(Number.isFinite(urlRating) ? urlRating : 0)
    setSort(urlSort)
    setPriceRange(urlMin && urlMax ? [parseInt(urlMin, 10), parseInt(urlMax, 10)] : null)
    setNearMe(urlNear)
    setSourceFilter(urlSource)
  }, [urlQ, urlFilter, urlRating, urlSort, urlMin, urlMax, urlNear, urlSource])

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [debouncedSearch, activeFilter, rating, sort, activePrice[0], activePrice[1], nearMe, coords, sourceFilter])

  // Auto-refresh stale listings from the scraper — but only once per session
  // per vertical, so a page visit doesn't trigger a paid scrape every time.
  const SCRAPE_GUARD_MS = 60 * 60 * 1000
  useEffect(() => {
    if (rawItems && rawItems.length > 0) {
      const hasStale = rawItems.some(i => !i.scrapedAt || Date.now() - i.scrapedAt > 24 * 60 * 60 * 1000)
      if (hasStale || (!rawItems.some(i => i.scrapedAt) && vertical !== 'taxis')) {
        const key = `kt_scrape_${vertical}`
        let lastScrape = 0
        try { lastScrape = parseInt(sessionStorage.getItem(key) || '0', 10) || 0 } catch { /* ignore */ }
        if (Date.now() - lastScrape > SCRAPE_GUARD_MS) {
          try { sessionStorage.setItem(key, String(Date.now())) } catch { /* ignore */ }
          scrapeAction({ vertical }).catch(console.error)
        }
      }
    }
  }, [rawItems, vertical, scrapeAction])

  async function upgradeImages() {
    if (upgrading) return
    setUpgrading(true)
    try {
      const result = await backfillImages()
      const updated = result?.updated ?? 0
      if (updated === 0) toast.success('Images are already up to date')
      else toast.success(`Upgraded ${updated} listing${updated === 1 ? '' : 's'} to real photos`)
    } catch {
      toast.error('Could not upgrade images')
    } finally {
      setUpgrading(false)
    }
  }

  function resetAll() {
    setSearchTerm('')
    setActiveFilter('all')
    setRating(0)
    setSort('recommended')
    setPriceRange(null)
    setNearMe(false)
    setCoords(null)
    setSourceFilter('all')
  }

  function toggleNearMe() {
    if (nearMe) { setNearMe(false); setCoords(null); return }
    setNearMe(true)
    if (!('geolocation' in navigator)) { setNearMe(false); toast.error('Location is not supported by this browser'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => {
        setNearMe(false)
        setLocating(false)
        toast.error('Could not get your location — check browser permissions')
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  function toggleSourceFilter(source?: string | null) {
    const target = sourceToFilter(source)
    if (!target) return
    setSourceFilter(prev => (prev === target ? 'all' : target))
  }

  async function toggleSave(listingId: string) {
    if (!isSignedIn) { setPendingSaveId(listingId); signInRef.current?.click(); return }
    try {
      if (savedIds.has(listingId as Id<'listings'>)) { await removeListing({ listingId: listingId as Id<'listings'> }); toast.success('Removed from saved') }
      else { await saveListing({ listingId: listingId as Id<'listings'> }); toast.success('Saved to your list') }
    } catch { toast.error('Could not update your saved list') }
  }

  function handleMarkerSelect(id: string) {
    setHoveredId(id)
    document.getElementById(`listing-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const mapPoints = (filteredItems ?? []).map(toPoint)
  const visible = filteredItems?.slice(0, visibleCount)
  const hasActiveFilters = activeFilter !== 'all' || rating > 0 || priceNarrowed || nearMe || sourceFilter !== 'all'

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Explore Kenya</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight capitalize">
          {categories.find(c => c.id === vertical)?.label}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {filteredItems
            ? `${filteredItems.length} of ${counts?.[vertical] ?? 0} verified options${debouncedSearch ? ` matching "${debouncedSearch}"` : ''}`
            : 'Loading...'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">{formatUpdated(lastScrapedAt)}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={upgradeImages}
            disabled={upgrading}
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            <ImageIcon className="size-3.5" />
            {upgrading ? 'Upgrading…' : 'Upgrade images'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Input
                className="h-11 pl-10"
                aria-label="Search"
                placeholder="Mara, Nairobi, Mombasa..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (() => {
                const q = searchTerm.toLowerCase()
                const suggestions: { name: string; location: string }[] = []
                const seen = new Set<string>()
                for (const i of rawItems ?? []) {
                  if (suggestions.length >= 6) break
                  if (seen.has(i.name)) continue
                  if (!i.name.toLowerCase().includes(q) && !i.location.toLowerCase().includes(q)) continue
                  seen.add(i.name)
                  suggestions.push({ name: i.name, location: i.location })
                }
                if (suggestions.length === 0) return null
                return (
                  <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg">
                    {suggestions.map(s => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => setSearchTerm(s.name)}
                        className="flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/60"
                      >
                        <span className="truncate font-medium">{s.name}</span>
                        <span className="shrink-0 truncate text-xs text-muted-foreground">{s.location}</span>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
            <Select value={sort} onValueChange={v => setSort(v as SortValue)}>
              <SelectTrigger className="h-11 w-full sm:w-[190px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {searchTerm && (
            <p className="text-xs text-muted-foreground">
              Searching {categories.find(c => c.id === vertical)?.label} for &ldquo;{searchTerm}&rdquo;
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {([{ value: 'all', label: 'All' }, { value: 'rated', label: 'Highly rated 4.7+' }, { value: 'budget', label: 'Budget under KES 15k' }] as { value: QuickFilter; label: string }[]).map(option => (
              <button
                key={option.value}
                onClick={() => setActiveFilter(option.value)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  activeFilter === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={toggleNearMe}
              disabled={locating}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
                nearMe
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              <LocateFixed className="size-3.5" />
              {locating ? 'Finding you…' : nearMe ? `Near me (${NEAR_KM} km)` : 'Near me'}
            </button>
            <span className="hidden h-6 w-px bg-border sm:block" />
            {([{ value: 'all', label: 'Any source' }, { value: 'firecrawl', label: 'Firecrawl' }, { value: 'live', label: 'Live web' }, { value: 'curated', label: 'Curated' }] as { value: SourceFilter; label: string }[]).map(option => (
              <button
                key={option.value}
                onClick={() => setSourceFilter(option.value)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  sourceFilter === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Price range</span>
                <span className="text-muted-foreground">{formatKES(activePrice[0])} – {formatKES(activePrice[1])}</span>
              </div>
              <Slider
                min={priceBounds.min}
                max={priceBounds.max}
                step={1000}
                value={[activePrice[0], activePrice[1]]}
                onValueChange={v => {
                  const next = Array.isArray(v) ? v : [v, v]
                  setPriceRange([next[0], next[1]])
                }}
                aria-label="Price range"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Rating</span>
                <span className="text-muted-foreground">{rating > 0 ? `${rating.toFixed(1)}+` : 'Any'}</span>
              </div>
              <Slider
                min={3.5}
                max={5}
                step={0.1}
                value={[rating > 0 ? rating : 3.5]}
                onValueChange={v => setRating(Array.isArray(v) ? v[0] : v)}
                aria-label="Minimum rating"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {rating > 0 && (
                <button onClick={() => setRating(0)} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                  Rating {rating.toFixed(1)}+ <X className="size-3.5" />
                </button>
              )}
              {priceNarrowed && (
                <button onClick={() => setPriceRange(null)} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                  {formatKES(activePrice[0])} – {formatKES(activePrice[1])} <X className="size-3.5" />
                </button>
              )}
              {nearMe && (
                <button onClick={() => { setNearMe(false); setCoords(null) }} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                  Near me {coords ? '' : '(locating)'} <X className="size-3.5" />
                </button>
              )}
              {sourceFilter !== 'all' && (
                <button onClick={() => setSourceFilter('all')} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                  {sourceFilter === 'firecrawl' ? 'Firecrawl' : sourceFilter === 'live' ? 'Live web' : 'Curated'} <X className="size-3.5" />
                </button>
              )}
              <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1.5">
                <RotateCcw className="size-3.5" /> Reset
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            {visible ? (
              visible.map(item => {
                const saved = savedIds.has(item._id)
                const active = hoveredId === item._id
                return (
                  <Card
                    key={item._id}
                    id={`listing-${item._id}`}
                    onMouseEnter={() => setHoveredId(item._id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={cn('group overflow-hidden p-0 transition-all hover:border-primary/40', active && 'border-primary ring-2 ring-primary/20')}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <Link href={`/discover/${item.vertical}/${item._id}`}>
                        <ListingImage
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <Badge className="absolute left-3 top-3 bg-card text-card-foreground">
                          {item.tags[0]}
                        </Badge>
                      </Link>
                      <SourceBadge
                        source={item.source}
                        className="absolute bottom-3 left-3"
                        onClick={() => toggleSourceFilter(item.source)}
                      />
                      <button
                        aria-label={saved ? 'Remove from saved' : 'Save to your list'}
                        onClick={e => { e.preventDefault(); toggleSave(item._id) }}
                        className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-sm transition-transform hover:scale-110"
                      >
                        <Heart className={cn('size-4', saved && 'fill-red-500 text-red-500')} />
                      </button>
                    </div>
                    <Link href={`/discover/${item.vertical}/${item._id}`}>
                      <CardHeader className="gap-2 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-lg leading-tight">{item.name}</CardTitle>
                            <p className="mt-1 truncate text-sm text-muted-foreground">{item.location}</p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
                            <Star className="size-4 fill-accent text-accent" />
                            {item.rating}
                          </span>
                        </div>
                        {(item.rating >= 4.8 || item.reviews >= 500 || item.freeCancellation || item.instantConfirm) && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.rating >= 4.8 && (
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Top rated</span>
                            )}
                            {item.reviews >= 500 && (
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Loved by {item.reviews} travellers</span>
                            )}
                            {item.freeCancellation && (
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Free cancellation</span>
                            )}
                            {item.instantConfirm && (
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Instant confirmation</span>
                            )}
                          </div>
                        )}
                        <div>
                          <span className="font-semibold">{formatKES(item.price)}</span>
                          <span className="text-sm text-muted-foreground"> / {item.unit}</span>
                        </div>
                      </CardHeader>
                    </Link>
                  </Card>
                )
              })
            ) : (
              Array(PAGE_SIZE).fill(null).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-[4/3] w-full rounded-none" />
                  <CardContent className="space-y-2 p-4">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {filteredItems && visibleCount < filteredItems.length && (
            <Button variant="outline" className="self-center" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
              Show more ({filteredItems.length - visibleCount} more)
            </Button>
          )}

          {filteredItems && filteredItems.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No results found for your search.</p>
              <Button variant="link" onClick={resetAll}>
                Clear filters
              </Button>
            </div>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <KenyaMap
              points={mapPoints}
              className="h-[calc(100vh-7rem)]"
              hoveredId={hoveredId}
              onMarkerEnter={setHoveredId}
              onMarkerLeave={() => setHoveredId(null)}
              onMarkerSelect={handleMarkerSelect}
            />
          </div>
        </aside>
      </div>

      <SignInButton mode="modal"><div ref={signInRef} style={{ display: 'none' }} /></SignInButton>
    </div>
  )
}
