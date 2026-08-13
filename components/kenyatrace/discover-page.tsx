'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { SignInButton, useUser } from '@clerk/nextjs'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Skeleton } from '@/components/ui/skeleton'
import { Car, Check, Heart, LocateFixed, Map, RotateCcw, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { categories, formatKES, type Vertical } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { KenyaMap, toPoint } from './kenya-map'
import { ListingImage, type SourceFilterValue } from './shared'

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

/** Hero photo + one-line tagline per category. */
const VERTICAL_HERO: Record<string, { image: string; tagline: string }> = {
  stays: { image: 'https://upload.wikimedia.org/wikipedia/commons/7/72/PIC_0106.JPG', tagline: 'Wake up by the coast or in the wild' },
  flights: { image: 'https://upload.wikimedia.org/wikipedia/commons/d/d4/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg', tagline: 'City to savannah in an hour' },
  'things-to-do': { image: 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Kilimanjaro_from_Amboseli.jpg', tagline: 'Game drives, water sports, culture' },
  attractions: { image: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Masai_Mara_landscape.jpg', tagline: 'The places Kenya is famous for' },
  cars: { image: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Lake_Naivasha%2C_Kenya_%2845636345554%29.jpg', tagline: 'Drive Kenya your own way' },
  taxis: { image: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Masai_Mara_landscape.jpg', tagline: 'City rides and airport runs' },
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
  const params = useSearchParams()
  const urlQ = params.get('q') || ''
  const urlFilter = (params.get('filter') || 'all') as QuickFilter
  const urlRating = parseFloat(params.get('rating') || '0')
  const urlSort = (params.get('sort') || 'recommended') as SortValue
  const urlMin = params.get('min')
  const urlMax = params.get('max')
  const urlNear = params.get('near') === '1'
  const urlSource = (params.get('source') || 'all') as SourceFilter
  const urlAmenities = (params.get('amenity') || '').split(',').filter(Boolean)

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
  const [amenities, setAmenities] = useState<string[]>(urlAmenities)
  const [locating, setLocating] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  // Lock body scroll while the full-screen mobile map is open.
  useEffect(() => {
    document.body.style.overflow = mapOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mapOpen])

  const rawItems = useQuery(api.listings.search, { vertical, term: debouncedSearch || undefined })
  const scrapeAction = useAction(api.scraper.index.searchWithScrape)

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
    if (amenities.includes('freeCancellation')) items = items.filter(i => i.freeCancellation)
    if (amenities.includes('instantConfirm')) items = items.filter(i => i.instantConfirm)
    switch (sort) {
      case 'recent': items.sort((a, b) => (b.scrapedAt ?? b._creationTime) - (a.scrapedAt ?? a._creationTime)); break
      case 'price_asc': items.sort((a, b) => a.price - b.price); break
      case 'price_desc': items.sort((a, b) => b.price - a.price); break
      case 'rating': items.sort((a, b) => b.rating - a.rating); break
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItems, activeFilter, rating, sort, activePrice[0], activePrice[1], nearMe, coords, sourceFilter, amenities])

  useEffect(() => {
    const p = new URLSearchParams()
    if (debouncedSearch) p.set('q', debouncedSearch)
    if (activeFilter !== 'all') p.set('filter', activeFilter)
    if (rating > 0) p.set('rating', String(rating))
    if (priceNarrowed) { p.set('min', String(activePrice[0])); p.set('max', String(activePrice[1])) }
    if (nearMe) p.set('near', '1')
    if (sourceFilter !== 'all') p.set('source', sourceFilter)
    if (amenities.length > 0) p.set('amenity', amenities.join(','))
    if (sort !== 'recommended') p.set('sort', sort)
    const qs = p.toString()
    const target = `/discover/${vertical}${qs ? `?${qs}` : ''}`
    if (target !== window.location.pathname + window.location.search) {
      router.replace(target, { scroll: false })
    }
  }, [debouncedSearch, activeFilter, rating, sort, priceNarrowed, activePrice, nearMe, sourceFilter, amenities, vertical, router])

  useEffect(() => {
    setSearchTerm(urlQ)
    setDebouncedSearch(urlQ)
    setActiveFilter(urlFilter)
    setRating(Number.isFinite(urlRating) ? urlRating : 0)
    setSort(urlSort)
    setPriceRange(urlMin && urlMax ? [parseInt(urlMin, 10), parseInt(urlMax, 10)] : null)
    setNearMe(urlNear)
    setSourceFilter(urlSource)
    setAmenities((params.get('amenity') || '').split(',').filter(Boolean))
  }, [urlQ, urlFilter, urlRating, urlSort, urlMin, urlMax, urlNear, urlSource, params])

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [debouncedSearch, activeFilter, rating, sort, activePrice[0], activePrice[1], nearMe, coords, sourceFilter, amenities])

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

  function resetAll() {
    setSearchTerm('')
    setActiveFilter('all')
    setRating(0)
    setSort('recommended')
    setPriceRange(null)
    setNearMe(false)
    setCoords(null)
    setSourceFilter('all')
    setAmenities([])
  }

  function toggleAmenity(value: string) {
    setAmenities(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
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

  // From the full-screen mobile map: close it, then highlight the listing.
  function handleMobileMarkerSelect(id: string) {
    setMapOpen(false)
    requestAnimationFrame(() => handleMarkerSelect(id))
  }

  const mapPoints = (filteredItems ?? []).map(toPoint)
  const visible = filteredItems?.slice(0, visibleCount)
  const hasActiveFilters = activeFilter !== 'all' || rating > 0 || priceNarrowed || nearMe || sourceFilter !== 'all' || amenities.length > 0
  const activeFilterCount = [activeFilter !== 'all', rating > 0, priceNarrowed, nearMe, sourceFilter !== 'all', amenities.length > 0].filter(Boolean).length
  const hero = VERTICAL_HERO[vertical] ?? VERTICAL_HERO.attractions
  const label = categories.find(c => c.id === vertical)?.label ?? vertical

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6">
      {/* Hero — one attractive picture, category name, nothing else. */}
      <div className="relative overflow-hidden rounded-xl">
        <div className="relative h-44 md:h-52">
          <ListingImage src={hero.image} alt={label} fill priority className="object-cover" sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/35" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5 md:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Discover Kenya</p>
              <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-white md:text-4xl">{label}</h1>
              <p className="mt-1 text-sm text-white/85">{hero.tagline}</p>
            </div>
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white backdrop-blur-sm">
              {filteredItems ? `${filteredItems.length} place${filteredItems.length === 1 ? '' : 's'}` : '…'}
            </span>
          </div>
        </div>
      </div>

      {/* Compact search bar — filters hide behind the toggle. */}
      <Card className="shadow-none">
        <CardContent className="flex flex-col gap-3 p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Input
                className="h-11 pl-10"
                aria-label="Search"
                placeholder="Mara, Nairobi, Diani..."
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
            <div className="flex gap-2">
              <Select value={sort} onValueChange={v => setSort(v as SortValue)}>
                <SelectTrigger className="h-11 w-full sm:w-[170px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="h-11 gap-2" onClick={() => setFiltersOpen(o => !o)}>
                <SlidersHorizontal className="size-4" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{activeFilterCount}</span>
                )}
              </Button>
            </div>
          </div>

          {filtersOpen && (
            <div className="flex flex-col gap-4 border-t pt-3">
              <div className="flex flex-wrap gap-2">
                {([
                  { kind: 'filter', value: 'all', label: 'All' },
                  { kind: 'filter', value: 'rated', label: 'Top rated' },
                  { kind: 'filter', value: 'budget', label: 'Budget' },
                  { kind: 'amenity', value: 'freeCancellation', label: 'Free cancellation' },
                  { kind: 'amenity', value: 'instantConfirm', label: 'Instant confirmation' },
                ] as { kind: 'filter' | 'amenity'; value: string; label: string }[]).map(option => {
                  const active = option.kind === 'amenity' ? amenities.includes(option.value) : activeFilter === option.value
                  return (
                    <button
                      key={option.value}
                      onClick={() => (option.kind === 'amenity' ? toggleAmenity(option.value) : setActiveFilter(option.value as QuickFilter))}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {option.kind === 'amenity' && active && <Check className="size-3.5" />}
                      {option.label}
                    </button>
                  )
                })}
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
                  {locating ? 'Finding…' : 'Near me'}
                </button>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Price</span>
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
                      Near me <X className="size-3.5" />
                    </button>
                  )}
                  {sourceFilter !== 'all' && (
                    <button onClick={() => setSourceFilter('all')} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                      {sourceFilter === 'firecrawl' ? 'Firecrawl' : sourceFilter === 'live' ? 'Live web' : 'Curated'} <X className="size-3.5" />
                    </button>
                  )}
                  {amenities.map(value => (
                    <button key={value} onClick={() => toggleAmenity(value)} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                      {value === 'freeCancellation' ? 'Free cancellation' : 'Instant confirmation'} <X className="size-3.5" />
                    </button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1.5">
                    <RotateCcw className="size-3.5" /> Reset
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    className={cn(
                      'group relative rounded-xl border-0 bg-transparent p-0 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl',
                      active && 'ring-2 ring-primary/40',
                    )}
                  >
                    <Link href={`/discover/${item.vertical}/${item._id}`} className="block">
                      <div className="relative aspect-[3/2] overflow-hidden rounded-xl">
                        <ListingImage
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25" />
                        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-foreground shadow-sm">
                          {formatKES(item.price)}
                          <span className="font-medium text-muted-foreground"> / {item.unit}</span>
                        </span>
                        {item.rating > 0 && (
                          <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                            {item.rating.toFixed(1)}
                          </span>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-3 pr-16">
                          <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                          <p className="mt-0.5 truncate text-xs text-white/85">{item.location}</p>
                        </div>
                      </div>
                    </Link>
                    <button
                      aria-label={saved ? 'Remove from saved' : 'Save to your list'}
                      onClick={e => { e.preventDefault(); toggleSave(item._id) }}
                      className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-all hover:scale-110 hover:bg-black/60"
                    >
                      <Heart className={cn('size-4 transition-colors', saved && 'fill-red-500 text-red-500')} />
                    </button>
                  </Card>
                )
              })
            ) : (
              Array(PAGE_SIZE).fill(null).map((_, i) => (
                <Card key={i} className="rounded-xl border-0 bg-transparent p-0">
                  <Skeleton className="aspect-[3/2] w-full rounded-xl" />
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
            vertical === 'taxis' ? (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary"><Car className="size-6" /></span>
                <div>
                  <p className="font-serif text-2xl font-semibold tracking-tight">Coming soon</p>
                  <p className="mx-auto mt-1 text-sm text-muted-foreground">Airport transfers and city rides.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" nativeButton={false} render={<Link href="/discover/cars" />}>Rent a car</Button>
                  <Button variant="outline" nativeButton={false} render={<Link href="/discover/flights" />}>Domestic flights</Button>
                  <Button variant="link" onClick={resetAll}>Clear filters</Button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">No results found for your search.</p>
                <Button variant="link" onClick={resetAll}>
                  Clear filters
                </Button>
              </div>
            )
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <KenyaMap
              points={mapPoints}
              labelMode
              className="h-[calc(100vh-7rem)]"
              hoveredId={hoveredId}
              onMarkerEnter={setHoveredId}
              onMarkerLeave={() => setHoveredId(null)}
              onMarkerSelect={handleMarkerSelect}
            />
          </div>
        </aside>
      </div>

      {/* Floating map button — mobile only, sits above the bottom nav. */}
      <button
        type="button"
        onClick={() => setMapOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95 lg:hidden"
      >
        <Map className="size-4" /> Map
      </button>

      {/* Full-screen mobile map. */}
      {mapOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <p className="font-semibold">Map · {label}</p>
            <Button variant="ghost" size="icon" aria-label="Close map" onClick={() => setMapOpen(false)}>
              <X className="size-5" />
            </Button>
          </div>
          <KenyaMap
            points={mapPoints}
            labelMode
            className="min-h-0 flex-1 rounded-none border-0"
            hoveredId={hoveredId}
            onMarkerEnter={setHoveredId}
            onMarkerLeave={() => setHoveredId(null)}
            onMarkerSelect={handleMobileMarkerSelect}
          />
        </div>
      )}

      <SignInButton mode="modal"><div ref={signInRef} style={{ display: 'none' }} /></SignInButton>
    </div>
  )
}
