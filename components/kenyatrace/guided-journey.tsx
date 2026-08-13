'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SignInButton, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { ArrowRight, Camera, Check, CheckCircle2, Compass, Copy, Flag, Loader2, LocateFixed, MapPin, MessageCircle, Navigation, Route, Send, Share2, Sparkles, Star, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { BUDGET_TIER_META, budgetTierId, dailyAllowance, tierMismatchWarning } from '@/lib/budget'
import { geocodeArea, reverseGeocode } from '@/lib/geocode'
import { formatKES, wikimediaThumb } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { KenyaMap } from './kenya-map'
import { ItineraryEditor } from './itinerary-editor'
import { BudgetBar, ListingImage } from './shared'
import { SampleTraceDialog } from './sample-trace'
import { useTracking } from './tracking-provider'
import type { Stop } from './types'

type Traveler = 'citizen' | 'tourist' | 'foreigner'
type Stage = 'where' | 'budget' | 'plan' | 'track' | 'share' | 'done'

interface JourneyLeg { from: string; to: string; how: string; distanceKm: number; timeMins: number; cost: number }
interface JourneyPlan { name: string; destination: string; summary: string; originNote: string; journey: JourneyLeg[]; stops: Stop[] }

interface Draft {
  origin: string
  originLat?: number
  originLng?: number
  traveler: Traveler | null
  days: number
  interests: string[]
  budget: number
  pace: 'relaxed' | 'balanced' | 'full'
  extra: string
  plan: JourneyPlan | null
  tripId: Id<'trips'> | null
  rating: number
  review: string
  published: boolean
}

const DRAFT_KEY = 'ktJourneyDraft'

const TOWNS: { name: string; lat: number; lng: number }[] = [
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219 },
  { name: 'Mombasa', lat: -4.0435, lng: 39.6682 },
  { name: 'Kisumu', lat: -0.0917, lng: 34.768 },
  { name: 'Nakuru', lat: -0.3031, lng: 36.08 },
  { name: 'Eldoret', lat: 0.5143, lng: 35.2698 },
  { name: 'Nyeri', lat: -0.4201, lng: 36.9476 },
  { name: 'Naivasha', lat: -0.7172, lng: 36.431 },
  { name: 'Malindi', lat: -3.2176, lng: 40.1165 },
  { name: 'Lamu', lat: -2.2711, lng: 40.902 },
  { name: 'Watamu', lat: -3.352, lng: 40.038 },
  { name: 'Diani', lat: -4.3155, lng: 39.581 },
  { name: 'Thika', lat: -1.0331, lng: 37.0693 },
  { name: 'Kitale', lat: 1.0157, lng: 35.0062 },
  { name: 'Machakos', lat: -1.5177, lng: 37.2634 },
  { name: 'Embu', lat: -0.5316, lng: 37.45 },
  { name: 'Meru', lat: 0.05, lng: 37.65 },
  { name: 'Maasai Mara', lat: -1.4, lng: 35.1333 },
  { name: 'Amboseli', lat: -2.65, lng: 37.26 },
]

const BUDGETS = [5000, 15000, 30000, 60000, 120000, 250000]
const INTERESTS = ['Wildlife', 'Safari', 'Beach', 'Food', 'Culture', 'Adventure', 'Local life', 'Hiking', 'Luxury', 'City']

const TRAVELERS: { id: Traveler; label: string; text: string }[] = [
  { id: 'citizen', label: 'Kenyan citizen', text: 'Local rates, matatus, weekend trips' },
  { id: 'tourist', label: 'Tourist in Kenya', text: 'Safaris, coast, guided tours' },
  { id: 'foreigner', label: 'Foreigner abroad', text: 'First-time Kenya, flights, packages' },
]

const JOURNEY_HERO = 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Kilimanjaro_from_Amboseli.jpg'

const MODELS: { label: string; origin: string; traveler: Traveler; days: number; budget: number }[] = [
  { label: 'Mara escape', origin: 'Nairobi', traveler: 'tourist', days: 2, budget: 60000 },
  { label: 'Coast & beach', origin: 'Mombasa', traveler: 'tourist', days: 5, budget: 120000 },
  { label: 'Rift Valley', origin: 'Nakuru', traveler: 'citizen', days: 3, budget: 30000 },
]

const STAGES: { id: Stage; label: string }[] = [
  { id: 'where', label: 'Location' },
  { id: 'budget', label: 'Budget' },
  { id: 'plan', label: 'Plan' },
  { id: 'track', label: 'Track' },
  { id: 'share', label: 'Share' },
  { id: 'done', label: 'Done' },
]

const GENERATION_STEPS = [
  'Reading your location and travel style…',
  'Choosing the best destinations from where you are…',
  'Working out how to get there and what it costs…',
  'Building your day-by-day Kenya plan…',
]

function emptyDraft(): Draft {
  return {
    origin: '',
    traveler: null,
    days: 4,
    interests: ['Wildlife'],
    budget: 60000,
    pace: 'balanced',
    extra: '',
    plan: null,
    tripId: null,
    rating: 0,
    review: '',
    published: false,
  }
}

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="transition-transform hover:scale-110">
          <Star className={cn('size-7', n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
        </button>
      ))}
    </div>
  )
}

function GenerationProgress({ active }: { active: number }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="size-4 animate-pulse" /> Planning your trip
      </p>
      <div className="flex flex-col gap-2">
        {GENERATION_STEPS.map((step, i) => {
          const isDone = i < active
          const isActive = i === active
          return (
            <div key={step} className={cn('flex items-center gap-2 text-sm transition-all duration-300', isActive ? 'font-medium text-foreground' : isDone ? 'text-muted-foreground' : 'text-muted-foreground opacity-40')}>
              {isDone ? (
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
              ) : isActive ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <span className="flex size-4 shrink-0 items-center justify-center"><span className="size-1.5 rounded-full bg-border" /></span>
              )}
              <span className="truncate">{step}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function enrichStops(stops: Stop[], listings: { name: string; lat: number; lng: number }[] | undefined): Stop[] {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  return stops.map(s => {
    if (s.lat && s.lng) return s
    const t = norm(s.title)
    const listing = (listings ?? []).find(l => {
      const n = norm(l.name)
      if (n.length < 4) return false
      return n.includes(t) || (t.length >= 4 && t.includes(n))
    })
    if (listing) return { ...s, lat: listing.lat, lng: listing.lng }
    const town = TOWNS.find(tw => norm(tw.name) === norm(s.place) || (norm(s.place).length >= 4 && norm(s.place).includes(norm(tw.name))))
    if (town) return { ...s, lat: town.lat, lng: town.lng }
    return s
  })
}

export function GuidedJourney() {
  const { isSignedIn } = useUser()
  const me = useQuery(api.users.me)
  const setConsent = useMutation(api.users.setTrackingConsent)
  const allListings = useQuery(api.listings.list, {})
  const create = useMutation(api.trips.create)
  const replaceStops = useMutation(api.trips.replaceStops)
  const updateTrip = useMutation(api.trips.update)
  const uploadUrl = useMutation(api.moments.generateUploadUrl)
  const createMoment = useMutation(api.moments.create)
  const signInRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { session: trackSession, start: startTrack, stop: stopTrack } = useTracking()

  // sessionStorage is loaded after mount so the server and client first
  // renders match (hydration-safe); the saved journey appears a tick later.
  const [draft, setDraft] = useState<Draft>(emptyDraft)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) setDraft(prev => ({ ...emptyDraft(), ...JSON.parse(raw) }))
    } catch { /* ignore */ }
  }, [])
  const [stage, setStage] = useState<Stage>('where')
  const [animPhase, setAnimPhase] = useState<'exit-left' | 'exit-right' | null>(null)
  const [enterAnim, setEnterAnim] = useState<'enter-right' | 'enter-left'>('enter-right')
  const animTimer = useRef<number | null>(null)
  const [locating, setLocating] = useState(false)

  /** Moves to the next workflow: current page slides out, the next slides in. */
  function goTo(next: Stage, force = false) {
    if (next === stage) return
    const forward = STAGES.findIndex(s => s.id === next) >= STAGES.findIndex(s => s.id === stage)
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const wasInFlight = animPhase !== null

    // A transition is already in flight: user clicks are ignored, while async
    // completions (force) cancel it and land on the page directly.
    if (wasInFlight) {
      if (!force) return
      if (animTimer.current !== null) window.clearTimeout(animTimer.current)
      animTimer.current = null
    }

    // Reduced motion, or an async completion interrupting a transition: swap instantly.
    if (reduced || (wasInFlight && force)) {
      setStage(next)
      setEnterAnim(forward ? 'enter-right' : 'enter-left')
      setAnimPhase(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setAnimPhase(forward ? 'exit-left' : 'exit-right')
    if (animTimer.current !== null) window.clearTimeout(animTimer.current)
    animTimer.current = window.setTimeout(() => {
      animTimer.current = null
      setStage(next)
      setEnterAnim(forward ? 'enter-right' : 'enter-left')
      setAnimPhase(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 200)
  }
  const [locError, setLocError] = useState<string | null>(null)
  const [manualArea, setManualArea] = useState('')
  const [resolvingArea, setResolvingArea] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [files, setFiles] = useState<{ file: File; video: boolean }[]>([])
  const [caption, setCaption] = useState('')
  const pendingFnRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* ignore */ }
  }, [draft])

  // The free AI model sometimes omits coordinates — backfill them from the
  // verified listings database and the known-towns table once available.
  // Only writes state when enrichment actually changed something, otherwise
  // an unfixable stop would re-trigger this effect forever.
  useEffect(() => {
    if (!draft.plan || !allListings) return
    if (!draft.plan.stops.some(s => !s.lat || !s.lng)) return
    const enriched = enrichStops(draft.plan.stops, allListings)
    const changed = enriched.some((s, i) => s.lat !== draft.plan!.stops[i]?.lat || s.lng !== draft.plan!.stops[i]?.lng)
    if (!changed) return
    setDraft(d => (d.plan ? { ...d, plan: { ...d.plan, stops: enriched } } : d))
  }, [allListings, draft.plan])

  useEffect(() => {
    if (!loading) { setProgressStep(0); return }
    const t = setInterval(() => setProgressStep(s => (s + 1) % GENERATION_STEPS.length), 1600)
    return () => clearInterval(t)
  }, [loading])

  useEffect(() => {
    if (isSignedIn && pendingFnRef.current) {
      const fn = pendingFnRef.current
      pendingFnRef.current = null
      fn()
    }
  }, [isSignedIn])

  useEffect(() => () => {
    if (animTimer.current !== null) window.clearTimeout(animTimer.current)
  }, [])

  const plan = draft.plan
  const destinationStop = (plan?.stops ?? []).filter(s => s.lat != null && s.lng != null).slice(-1)[0]

  // The shared live-tracking session (also powers the pinned widget).
  const activeSession = trackSession && draft.tripId && trackSession.tripId === String(draft.tripId) ? trackSession : null
  const tracking = activeSession?.status === 'tracking'

  // ─── Actions ──────────────────────────────────────────────────────────────

  // Uses the device's exact coordinates — no snapping to towns. The real
  // lat/lng are kept and sent to the AI so the plan is built around the
  // user's precise position.
  function locate() {
    if (!navigator.geolocation) {
      setLocError('Location is not supported by this browser — type your area below instead.')
      return
    }
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const label = await reverseGeocode(lat, lng)
        setDraft(d => ({ ...d, origin: label || `Lat ${lat.toFixed(3)}, Lng ${lng.toFixed(3)}`, originLat: lat, originLng: lng }))
        setLocating(false)
        toast.success('Exact location set — planning from here')
      },
      err => {
        setLocating(false)
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied — allow access, or type your area below.'
            : 'Could not get your location — allow access, or type your area below.',
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  // Manual fallback: geocodes the typed area to exact coordinates (Kenya).
  async function resolveArea() {
    const text = manualArea.trim()
    if (!text) return
    setResolvingArea(true)
    setLocError(null)
    try {
      const coords = await geocodeArea(text)
      if (coords) {
        const label = (await reverseGeocode(coords.lat, coords.lng)) || text
        setDraft(d => ({ ...d, origin: label, originLat: coords.lat, originLng: coords.lng }))
        toast.success('Location set')
      } else {
        setDraft(d => ({ ...d, origin: text, originLat: undefined, originLng: undefined }))
        toast.success(`Set as “${text}”`)
      }
    } finally {
      setResolvingArea(false)
    }
  }

  /** Picks a ready-made trip model: prefills the draft and jumps to budget. */
  function applyModel(m: (typeof MODELS)[number]) {
    const town = TOWNS.find(t => t.name === m.origin)
    setDraft(d => ({
      ...d,
      origin: m.origin,
      originLat: town?.lat,
      originLng: town?.lng,
      traveler: m.traveler,
      days: m.days,
      budget: m.budget,
    }))
    goTo('budget')
  }

  async function generatePlan() {
    if (!draft.origin || !draft.traveler) return
    setLoading(true)
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin: draft.origin,
          originLat: draft.originLat,
          originLng: draft.originLng,
          traveler: draft.traveler,
          budget: draft.budget,
          days: draft.days,
          interests: draft.interests,
          pace: draft.pace,
          extra: draft.extra,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      const enriched = { ...data, stops: enrichStops(data.stops as Stop[], allListings) }
      setDraft(d => ({ ...d, plan: enriched, tripId: null, published: false }))
      goTo('plan', true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not build your plan')
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
        origin: draft.origin,
        traveler: draft.traveler,
        budget: draft.budget,
        days: draft.days,
        interests: draft.interests,
        pace: draft.pace,
        extra: draft.extra,
        keptStops: dayStops.filter(s => s.locked).map(s => ({ title: s.title, place: s.place })),
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    return enrichStops(data.stops as Stop[], allListings)
  }

  async function createTrip() {
    if (!plan) return
    // A trip was already created for this session (e.g. the user saved, went
    // "Back to plan", and pressed Save again) — reuse it instead of orphaning
    // a duplicate row.
    if (draft.tripId) {
      goTo('track', true)
      return
    }
    setSaving(true)
    try {
      const start = new Date()
      const end = new Date(start.getTime() + 86400000 * Math.max(draft.days - 1, 0))
      const id = await create({
        name: plan.name,
        destination: plan.destination,
        origin: draft.origin,
        traveler: draft.traveler ?? undefined,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        budget: draft.budget,
        totalCost: plan.stops.reduce((s, x) => s + x.cost, 0),
        stops: plan.stops.map((s, i) => ({
          name: s.title, place: s.place, day: s.day, time: s.time, cost: s.cost, kind: s.kind, order: i,
          lat: s.lat, lng: s.lng, locked: s.locked, reason: s.reason, verified: s.verified, duration: s.duration,
        })),
      })
      setDraft(d => ({ ...d, tripId: id }))
      goTo('track', true)
      toast.success('Trip saved — live tracking is ready')
    } catch (error) {
      toast.error(error instanceof Error && error.message.includes('access') ? 'Your access has expired — pick a plan to continue' : 'Could not save your trip')
    } finally {
      setSaving(false)
    }
  }

  function handleSaveTrip() {
    if (!isSignedIn) {
      pendingFnRef.current = () => { void createTrip() }
      signInRef.current?.click()
      return
    }
    void createTrip()
  }

  function handleEditorSave(stops: Stop[]) {
    if (!plan) return
    setDraft(d => ({ ...d, plan: { ...d.plan!, stops } }))
    if (draft.tripId) {
      replaceStops({
        tripId: draft.tripId,
        stops: stops.map((s, i) => ({ name: s.title, place: s.place, day: s.day, time: s.time, cost: s.cost, kind: s.kind, order: i, lat: s.lat, lng: s.lng, locked: s.locked, reason: s.reason, verified: s.verified, duration: s.duration })),
      }).then(() => toast.success('Itinerary saved')).catch(() => toast.error('Could not save changes'))
    }
  }

  // ─── Live tracking ────────────────────────────────────────────────────────

  function startTracking() {
    if (!draft.tripId || !plan) return
    if (!navigator.geolocation) { toast.error('Location is not supported'); return }
    if (!destinationStop?.lat || !destinationStop?.lng) { toast.error('This trip has no destination coordinates'); return }
    if (me?.trackingConsent !== true) {
      toast.error('Location tracing needs your consent — enable it below')
      return
    }
    startTrack({
      tripId: String(draft.tripId),
      tripName: plan.name,
      destinationName: plan.destination,
      destLat: destinationStop.lat,
      destLng: destinationStop.lng,
      originLabel: draft.origin,
    })
    toast.success('Live tracking started — it keeps running while you explore')
  }

  function stopTracking() {
    stopTrack()
    toast.success('Tracking stopped')
  }

  // ─── Share & publish ──────────────────────────────────────────────────────

  function onPickFiles(selected: FileList | null) {
    if (!selected) return
    const picked = Array.from(selected).slice(0, 8).map(file => ({ file, video: file.type.startsWith('video/') }))
    setFiles(prev => [...prev, ...picked].slice(0, 8))
  }

  async function publish() {
    if (!draft.tripId || !plan) return
    if (draft.rating === 0) { toast.error('Rate your experience first'); return }
    setPublishing(true)
    try {
      const imageIds: Id<'_storage'>[] = []
      const videoIds: Id<'_storage'>[] = []
      for (const { file, video } of files) {
        const url = await uploadUrl()
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
        const json = await res.json()
        if (!json.storageId) throw new Error('Upload failed')
        if (video) videoIds.push(json.storageId)
        else imageIds.push(json.storageId)
      }
      if (imageIds.length || videoIds.length) {
        await createMoment({
          tripId: draft.tripId,
          caption: caption.trim() || 'A moment from my Kenya trip',
          storageIds: imageIds.length ? imageIds : undefined,
          videoStorageIds: videoIds.length ? videoIds : undefined,
          public: true,
          location: plan.destination,
          lat: destinationStop?.lat, lng: destinationStop?.lng,
        })
      }
      await updateTrip({
        id: draft.tripId,
        patch: { rating: draft.rating, review: draft.review.trim() || undefined, status: 'completed', sharedAt: Date.now() },
      })
      setDraft(d => ({ ...d, published: true }))
      toast.success('Experience published')
    } catch {
      toast.error('Could not publish your experience')
    } finally {
      setPublishing(false)
    }
  }

  function handlePublish() {
    if (!isSignedIn) {
      pendingFnRef.current = () => { void publish() }
      signInRef.current?.click()
      return
    }
    void publish()
  }

  function resetSession() {
    stopTracking()
    try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    setDraft(emptyDraft())
    setFiles([])
    setCaption('')
    goTo('where')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/moments/${draft.tripId}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy link')
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareLink = `${siteOrigin}/moments/${draft.tripId}`
  const shareText = plan
    ? `I just explored ${plan.destination} with KenyaTrace${draft.rating ? ` and rated it ${draft.rating}/5` : ''}. Plan your own trip: ${shareLink}`
    : 'Plan your own Kenya trip with KenyaTrace'

  const mapPoints = useMemo(() => draft.plan?.stops
    ? draft.plan.stops.filter(s => s.lat && s.lng).map(s => ({ id: `${s.title}-${s.day}`, name: s.title, location: s.place, lat: s.lat!, lng: s.lng! }))
    : [], [draft.plan])

  // Stable identities so the map isn't rebuilt on every keystroke or slider move.
  const originPoints = useMemo(() =>
    draft.originLat != null && draft.originLng != null
      ? [{ id: 'origin', name: draft.origin || 'You are here', location: 'Your exact location', lat: draft.originLat, lng: draft.originLng }]
      : [],
    [draft.originLat, draft.originLng, draft.origin],
  )
  const originHighlight = useMemo(() => (draft.originLat != null ? ['origin'] : []), [draft.originLat])

  // Stable identities for the plan map (origin + stops + destination) so the
  // map isn't torn down and rebuilt on every unrelated re-render.
  const planMapPoints = useMemo(() => [
    ...(draft.originLat != null && draft.originLng != null
      ? [{ id: 'origin', name: draft.origin || 'Start', location: 'Starting point', lat: draft.originLat, lng: draft.originLng }]
      : []),
    ...mapPoints,
  ], [draft.originLat, draft.originLng, draft.origin, mapPoints])
  const planHighlight = useMemo(() => (draft.originLat != null ? ['origin'] : []), [draft.originLat])
  const planDestIds = useMemo(() => (mapPoints.length ? [mapPoints[mapPoints.length - 1].id] : []), [mapPoints])
  const originFocus = useMemo(() =>
    draft.originLat != null && draft.originLng != null ? { lat: draft.originLat, lng: draft.originLng, zoom: 11 } : undefined,
    [draft.originLat, draft.originLng],
  )
  const dayGroups = useMemo(() => {
    const map = new Map<number, Stop[]>()
    for (const s of plan?.stops ?? []) {
      const arr = map.get(s.day) ?? []
      arr.push(s)
      map.set(s.day, arr)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [plan])
  const mapRoute = useMemo(() => {
    const coords: [number, number][] = []
    // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
    if (draft.originLat != null && draft.originLng != null) coords.push([draft.originLng, draft.originLat])
    for (const s of plan?.stops ?? []) if (s.lat != null && s.lng != null) coords.push([s.lng, s.lat])
    return coords
  }, [draft.originLat, draft.originLng, plan])

  // Warns when a selected interest needs more per-day money than the budget tier provides.
  const tierWarning = useMemo(
    () => tierMismatchWarning(draft.interests, draft.budget, draft.days),
    [draft.interests, draft.budget, draft.days],
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-8">
      <SignInButton mode="modal"><div ref={signInRef} style={{ display: 'none' }} /></SignInButton>

      <div key={stage} className={animPhase ? `kt-step-${animPhase}` : `kt-step-${enterAnim}`}>

      {/* ── STAGE: WHERE ─────────────────────────────────────────────────── */}
      {stage === 'where' && (
        <div className="flex flex-col gap-6">
          <div className="relative h-56 overflow-hidden rounded-lg text-white md:h-64">
            <ListingImage src={wikimediaThumb(JOURNEY_HERO)} alt="Kenya" fill priority className="object-cover" sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15" />
            <div className="relative flex h-full flex-col justify-end p-6 md:p-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Plan a Kenya trip</p>
              <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight md:text-5xl">Where are you right now?</h1>
              <p className="mt-3 max-w-xl text-white/85">We plan the best of Kenya around your exact spot.</p>
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <Card className="flex-1">
              <CardContent className="flex flex-col gap-5 p-6">
                <div>
                  <p className="text-sm font-medium">Your exact location</p>
                  <div className="mt-3">
                    {!draft.origin ? (
                      <div className="flex flex-col gap-3">
                        <Button size="lg" onClick={locate} disabled={locating} className="w-full gap-2 sm:w-auto">
                          <LocateFixed className="size-5" />{locating ? 'Finding your exact location…' : 'Use my location'}
                        </Button>
                        {locError && <p className="text-sm text-destructive">{locError}</p>}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
                        </div>
                        <div className="flex gap-2">
                          <Input
                            className="flex-1"
                            value={manualArea}
                            onChange={e => setManualArea(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void resolveArea() }}
                            placeholder="Type your area, e.g. Westlands, Nairobi"
                          />
                          <Button variant="outline" onClick={() => void resolveArea()} disabled={!manualArea.trim() || resolvingArea}>
                            {resolvingArea ? '…' : 'Set'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><MapPin /></span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{draft.origin}</p>
                              <p className="text-xs text-muted-foreground">
                                {draft.originLat != null && draft.originLng != null
                                  ? `${Math.abs(draft.originLat).toFixed(4)}°${draft.originLat < 0 ? 'S' : 'N'}, ${Math.abs(draft.originLng).toFixed(4)}°${draft.originLng < 0 ? 'W' : 'E'} · exact location`
                                  : 'Area set'}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button variant="outline" size="sm" onClick={() => setDraft(d => ({ ...d, origin: '', originLat: undefined, originLng: undefined }))}>Change</Button>
                            <Button variant="outline" size="sm" onClick={locate} disabled={locating}>{locating ? '…' : 'Re-locate'}</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium">Who&apos;s travelling?</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {TRAVELERS.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setDraft(d => ({ ...d, traveler: t.id }))}
                        className={cn(
                          'rounded-md border p-3 text-left transition-colors',
                          draft.traveler === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40',
                        )}
                      >
                        <p className="text-sm font-semibold">{t.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.text}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">How many days?</p>
                    <span className="text-sm font-semibold text-primary">{draft.days} day{draft.days === 1 ? '' : 's'}</span>
                  </div>
                  <Slider className="mt-3" min={1} max={14} step={1} value={[draft.days]} onValueChange={v => setDraft(d => ({ ...d, days: Array.isArray(v) ? v[0] : v }))} aria-label="Trip length in days" />
                </div>

                <div>
                  <p className="text-sm font-medium">Or start from a model</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {MODELS.map(m => (
                      <button
                        key={m.label}
                        type="button"
                        onClick={() => applyModel(m)}
                        className="rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                      >
                        <p className="text-sm font-semibold">{m.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{m.days} days · {formatKES(m.budget)}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" disabled={!draft.origin || !draft.traveler} onClick={() => goTo('budget')} className="gap-2">
                    Continue <ArrowRight className="size-4" />
                  </Button>
                  <SampleTraceDialog />
                </div>
              </CardContent>
            </Card>          <div className="w-full lg:w-96">
            <KenyaMap
              points={originPoints}
              highlight={originHighlight}
              focus={originFocus}
              className="h-72 lg:h-96"
            />
          </div>
          </div>
        </div>
      )}

      {/* ── STAGE: BUDGET ─────────────────────────────────────────────────── */}
      {stage === 'budget' && (
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-tight">What&apos;s your budget?</h1>
            <p className="mt-2 text-muted-foreground">{draft.days} day{draft.days === 1 ? '' : 's'} from {draft.origin}.</p>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-5 p-6">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Total trip budget</p>
                  <span className="text-2xl font-bold text-primary">{formatKES(draft.budget)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>≈ {formatKES(dailyAllowance(draft.budget, draft.days))} per day</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-foreground">{BUDGET_TIER_META[budgetTierId(draft.budget, draft.days)].label}</span>
                </div>
                <Slider className="mt-4" min={5000} max={250000} step={5000} value={[draft.budget]} onValueChange={v => setDraft(d => ({ ...d, budget: Array.isArray(v) ? v[0] : v }))} aria-label="Trip budget" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {BUDGETS.map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setDraft(d => ({ ...d, budget: b }))}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        draft.budget === b ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {formatKES(b)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium">What are you into?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTERESTS.map(i => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDraft(d => ({ ...d, interests: d.interests.includes(i) ? d.interests.filter(x => x !== i) : [...d.interests, i] }))}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        draft.interests.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {i}
                    </button>
                  ))}
                </div>
                {tierWarning && (
                  <p className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" />
                    {tierWarning}
                  </p>
                )}
              </div>

            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => goTo('where')}>Back</Button>
            <div className="flex-1" />
            {loading ? (
              <GenerationProgress active={progressStep} />
            ) : (
              <Button size="lg" onClick={generatePlan} className="gap-2">
                Get my plan <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── STAGE: PLAN ───────────────────────────────────────────────────── */}
      {stage === 'plan' && (
        <div className="flex flex-col gap-6">
          {!plan ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-10 text-center">
              <Route className="size-10 text-primary" />
              <h2 className="font-serif text-3xl">Your plan isn&apos;t ready yet</h2>
              <p className="text-muted-foreground">Set your budget and we&apos;ll build it.</p>
              <Button onClick={() => goTo('budget')}>Set my budget</Button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">From {draft.origin}</p>
                <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">{plan.name}</h1>
                <p className="mt-2 max-w-3xl text-muted-foreground">{plan.summary}</p>
                <p className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary"><Sparkles className="mr-1 inline size-4 align-[-3px]" />{plan.originNote}</p>
              </div>

              {/* Budget vs plan cost */}
              <BudgetBar stops={plan.stops} budget={draft.budget} perDay={dailyAllowance(draft.budget, draft.days)} />

              {/* How to get there — route + cost cards, nothing else */}
              <div>
                <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight"><Navigation className="size-5 text-primary" /> How to get there</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {plan.journey.map((leg, i) => (
                    <Card key={i} className="p-4">
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

              {/* Day-by-day with per-stop directions */}
              <div>
                <h2 className="font-serif text-2xl font-semibold tracking-tight">Your days</h2>
                <div className="mt-3 flex flex-col gap-5">
                  {dayGroups.map(([day, stops]) => (
                    <div key={day}>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Day {day}</h3>
                      <div className="flex flex-col gap-2">
                        {stops.map((s, i) => (
                          <Card key={`${s.title}-${i}`} className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold">{s.title}</p>
                                  <Badge className="text-[10px]">{s.kind}</Badge>
                                </div>
                                <p className="mt-0.5 text-sm text-muted-foreground">{s.time} · {s.place}</p>
                                {s.howToGetThere && <p className="mt-1.5 text-sm"><span className="font-medium text-primary">Getting there: </span>{s.howToGetThere}</p>}
                                {s.reason && <p className="mt-1 text-sm italic text-muted-foreground/80">{s.reason}</p>}
                              </div>
                              <span className="shrink-0 text-sm font-semibold">{formatKES(s.cost)}</span>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={handleSaveTrip} disabled={saving} className="gap-2">
                  {saving ? <><Loader2 className="size-4 animate-spin" />Saving…</> : <><Navigation className="size-4" />Save trip & start tracking</>}
                </Button>
                <Button variant="outline" onClick={() => setAdjustOpen(o => !o)}>Adjust plan</Button>
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
            </>
          )}
        </div>
      )}

      {/* ── STAGE: TRACK ──────────────────────────────────────────────────── */}
      {stage === 'track' && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Live tracking</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Track your way there</h1>
            {plan && <p className="mt-2 text-muted-foreground">Destination: {plan.destination}.</p>}
          </div>

          {!draft.tripId ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-10 text-center">
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
                  {!tracking && activeSession?.status !== 'arrived' && me?.trackingConsent !== true && (
                    <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                      <p className="text-sm text-muted-foreground">Record your route while you travel?</p>
                      <Switch checked={false} onCheckedChange={v => setConsent({ consent: v }).then(() => v && toast.success('Location tracing enabled')).catch(() => toast.error('Could not update location consent'))} />
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
                            : `Your route from ${draft.origin} to ${plan?.destination ?? 'your destination'} — tracking keeps running while you explore the app`}
                        </p>
                        <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${activeSession?.progressPct ?? 0}%` }} />
                        </div>
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
                  <Button size="lg" onClick={() => goTo('share')} className="gap-2">Share your experience <ArrowRight className="size-4" /></Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STAGE: SHARE ──────────────────────────────────────────────────── */}
      {stage === 'share' && (
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Share your experience</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">{draft.published ? 'Experience shared' : 'How was it?'}</h1>
          </div>

          {!draft.tripId ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-10 text-center">
              <Camera className="size-10 text-primary" />
              <h2 className="font-serif text-3xl">Save your trip first</h2>
              <p className="max-w-md text-muted-foreground">Share this trip&apos;s photos, videos and rating.</p>
              <Button onClick={handleSaveTrip} disabled={saving} className="gap-2">{saving ? <><Loader2 className="size-4 animate-spin" />Saving…</> : 'Save trip'}</Button>
            </div>
          ) : draft.published ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-6" /></span>
                <div>
                  <p className="font-semibold">Your experience is live</p>
                  <p className="text-sm text-muted-foreground">Anyone with the link can see your photos, videos and {draft.rating}/5 rating.</p>
                </div>
              </div>

              <Card>
                <CardContent className="flex flex-col gap-4 p-6">
                  <p className="text-sm font-medium">Share this experience</p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={shareLink} className="flex-1 font-mono text-xs" />
                    <Button variant="outline" onClick={copyShareLink} className="gap-1.5">{copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy'}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><MessageCircle className="size-4" />WhatsApp</Button>
                    <Button variant="outline" nativeButton={false} render={<a href={`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><Send className="size-4" />Telegram</Button>
                    <Button variant="outline" nativeButton={false} render={<a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareLink)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><Share2 className="size-4" />Post</Button>
                    <Button variant="ghost" nativeButton={false} render={<a href={`/moments/${draft.tripId}`} target="_blank" rel="noopener noreferrer" />}>Open shared page</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Know someone planning a trip? Send them the link — it works without an account.</p>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => goTo('track')}>Back</Button>
                <Button size="lg" onClick={() => goTo('done')} className="gap-2">Finish session <Flag className="size-4" /></Button>
              </div>
            </div>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-col gap-5 p-6">
                  <div>
                    <p className="text-sm font-medium">Photos & videos</p>
                    <div className="mt-2">
                      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors hover:border-primary/40">
                        <Camera className="size-8 text-primary" />
                        <span className="text-sm font-medium">Tap to add photos or videos</span>
                        <span className="text-xs text-muted-foreground">Up to 8 files · JPG, PNG, MP4</span>
                        <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { onPickFiles(e.target.files); e.target.value = '' }} />
                      </label>
                    </div>
                    {files.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {files.map((f, i) => (
                          <div key={i} className="relative aspect-square overflow-hidden rounded-lg border">
                            {f.video ? (
                              <video src={URL.createObjectURL(f.file)} className="size-full object-cover" muted playsInline />
                            ) : (
                              <ListingImage src={URL.createObjectURL(f.file)} alt="" fill className="object-cover" sizes="160px" />
                            )}
                            <button
                              type="button"
                              aria-label="Remove file"
                              onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium">Caption</label>
                    <Input className="mt-1" value={caption} onChange={e => setCaption(e.target.value)} placeholder="The story behind this trip…" />
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium">Rate your experience</p>
                    <div className="mt-2"><StarRating value={draft.rating} onChange={n => setDraft(d => ({ ...d, rating: n }))} /></div>
                    <p className="mt-1 text-xs text-muted-foreground">{draft.rating ? `${draft.rating}/5 — ${draft.rating >= 4 ? 'glad you loved it' : draft.rating === 3 ? 'worthwhile trip' : 'thanks for the honest review'}` : 'Tap a star to rate'}</p>
                    <Textarea className="mt-3" value={draft.review} onChange={e => setDraft(d => ({ ...d, review: e.target.value }))} placeholder="A short review (optional)…" />
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" onClick={() => goTo('track')}>Back</Button>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => router.push('/discover')}>Skip for now</Button>
                  <Button size="lg" onClick={handlePublish} disabled={publishing || draft.rating === 0} className="gap-2">
                    {publishing ? <><Loader2 className="size-4 animate-spin" />Publishing…</> : <><Share2 className="size-4" />Publish & share</>}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STAGE: DONE ───────────────────────────────────────────────────── */}
      {stage === 'done' && (
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground"><Flag className="size-8" /></span>
          <h1 className="font-serif text-4xl font-semibold tracking-tight">Session complete</h1>
          <p className="max-w-md text-muted-foreground">
            {plan ? `You planned ${plan.destination} from ${draft.origin} over ${draft.days} day${draft.days === 1 ? '' : 's'} on a ${formatKES(draft.budget)} budget${draft.rating ? `, and rated it ${draft.rating}/5` : ''}.` : 'Your Kenya journey is complete.'}
          </p>

          {draft.rating > 0 && (
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn('size-6', n <= draft.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />)}
            </div>
          )}

          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={resetSession} className="gap-2"><MapPin className="size-4" />Start a new session</Button>
            <Button variant="outline" nativeButton={false} render={<a href="/trips" />}>View my trips</Button>
          </div>
          <p className="text-xs text-muted-foreground">Every session plans one destination — pick a new one and go again.</p>
        </div>
      )}
      </div>
    </div>
  )
}


