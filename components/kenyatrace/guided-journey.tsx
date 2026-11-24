'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useClerk, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { toast } from 'sonner'
import { geocodeArea, reverseGeocode } from '@/lib/geocode'
import { formatKES } from '@/lib/kenya-data'
import type { Stop } from './types'
import { JourneyProvider, type JourneyCtx } from './planner/context'
import { PlannerProgress } from './planner/bits'
import { PaywallDialog } from './paywall'
import {
  DRAFT_KEY, GENERATION_STEPS, INTERESTS, TOWNS, TRACE_HINT_PREFIX,
  emptyDraft, enrichStops, pickPlanCandidates, stayPatch, toTripStops,
  type Draft, type PlannerModel, type Stage,
} from './planner/lib'
import { WhereStage } from './planner/stages/where-stage'
import { BudgetStage } from './planner/stages/budget-stage'
import { PlanStage } from './planner/stages/plan-stage'
import { TrackStage } from './planner/stages/track-stage'
import { DoneStage, ShareStage } from './planner/stages/share-stage'
import { useTracking } from './tracking-provider'

/**
 * The guided planner orchestrator. Owns the journey draft (sessionStorage
 * backed), stage transitions with slide animations, and every mutation; the
 * per-stage UI lives in ./planner/stages/* and reads shared state through
 * JourneyContext.
 */
export function GuidedJourney() {
  const { isSignedIn } = useUser()
  const me = useQuery(api.users.me)
  const setConsent = useMutation(api.users.setTrackingConsent)
  const allListings = useQuery(api.listings.list, {})
  const create = useMutation(api.trips.create)
  const replaceStops = useMutation(api.trips.replaceStops)
  const updateTrip = useMutation(api.trips.update)
  const removeTrip = useMutation(api.trips.remove)
  const uploadUrl = useMutation(api.moments.generateUploadUrl)
  const createMoment = useMutation(api.moments.create)
  const clerk = useClerk()
  const [paywallOpen, setPaywallOpen] = useState(false)
  const router = useRouter()
  const { session: trackSession, start: startTrack, stop: stopTrack } = useTracking()

  // sessionStorage is loaded after mount so the server and client first
  // renders match (hydration-safe); the saved journey appears a tick later.
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  // Live trip doc for the share token: every trip gets a secret
  // traceShareToken on create — the public moments/recap link only works
  // with ?t=token, so the planner must include it (Wanderlog-style sharing
  // is link-first and must never 404).
  const draftTripId = draft.tripId
  const savedTrip = useQuery(api.trips.get, draftTripId ? { id: draftTripId } : 'skip')
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) setDraft({ ...emptyDraft(), ...JSON.parse(raw) })
    } catch { /* ignore */ }
  }, [])

  // Start-anywhere handoff: /plan?dest=X&days=N (e.g. from a shared trace)
  // seeds a fresh journey with the destination hint and trip length. Runs
  // after the sessionStorage restore, only when no plan is in progress.
  const searchParams = useSearchParams()
  const tracePrefillAppliedRef = useRef(false)
  useEffect(() => {
    if (tracePrefillAppliedRef.current) return
    const dest = searchParams.get('dest')?.trim().slice(0, 120)
    const daysRaw = Number(searchParams.get('days'))
    const days = Number.isFinite(daysRaw) && daysRaw >= 1 && daysRaw <= 14 ? Math.round(daysRaw) : null
    if (!dest && days == null) return
    tracePrefillAppliedRef.current = true
    setDraft(d => {
      // A journey already in progress (or restored from sessionStorage) wins.
      if (d.plan || d.tripId) return d
      const extra = dest ? `${TRACE_HINT_PREFIX}${dest}` : ''
      return { ...d, days: days ?? d.days, ...(extra ? { extra } : {}) }
    })
    if (dest) toast.success(`Planning around ${dest}`)
  }, [searchParams])
  const [stage, setStage] = useState<Stage>('where')
  // True when the planner was pre-filled from the signed-in profile's saved
  // preferences — shown as a small "pre-filled from your profile" note.
  const [prefilled, setPrefilled] = useState(false)
  const [animPhase, setAnimPhase] = useState<'exit-left' | 'exit-right' | null>(null)
  const [enterAnim, setEnterAnim] = useState<'enter-right' | 'enter-left'>('enter-right')
  const animTimer = useRef<number | null>(null)
  const [locating, setLocating] = useState(false)

  /** Moves to the next workflow: current page slides out, the next slides in. */
  function goTo(next: Stage, force = false) {
    if (next === stage) return
    const forward = STAGE_ORDER.indexOf(next) >= STAGE_ORDER.indexOf(stage)
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
  // Optimistic tracking-consent flip — the server value lands async.
  const [localConsent, setLocalConsent] = useState(false)
  const [files, setFiles] = useState<{ file: File; video: boolean }[]>([])
  const [caption, setCaption] = useState('')
  const pendingFnRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* ignore */ }
  }, [draft])

  // Keep a ref of the latest draft so the async location callback can check
  // whether the user already set an origin (typed or via a model) meanwhile.
  const draftRef = useRef(draft)
  draftRef.current = draft

  // When a signed-in traveller has saved preferences, apply them to a fresh
  // journey (one that hasn't been touched yet) so the planner starts smart.
  // Applied only once per session — later edits by the user are never stomped.
  const prefillAppliedRef = useRef(false)
  useEffect(() => {
    const p = me?.preferences
    if (!p || prefillAppliedRef.current) return
    if (draftRef.current.traveler) return
    prefillAppliedRef.current = true
    setDraft(d => {
      if (d.traveler) return d
      const next: Partial<Draft> = {}
      const interests = (p.interests ?? []).filter(i => INTERESTS.includes(i))
      if (interests.length) next.interests = interests
      if (p.pace === 'relaxed' || p.pace === 'balanced' || p.pace === 'full') next.pace = p.pace
      if (typeof p.budget === 'number' && p.budget >= 5000 && p.budget <= 250000) next.budget = p.budget
      return { ...d, ...next }
    })
    setPrefilled(true)
    toast.success('Pre-filled from your profile preferences')
  }, [me])

  // Auto-detect the traveller's location once on load, so planning starts
  // from where they actually are — never a default city. A quiet attempt:
  // permission denial or an unavailable GPS just leaves the manual fields.
  const autoLocatedRef = useRef(false)
  useEffect(() => {
    if (autoLocatedRef.current || draftRef.current.origin) return
    autoLocatedRef.current = true
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        setLocating(false)
        if (draftRef.current.origin) return
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const label = await reverseGeocode(lat, lng)
        setDraft(d => (d.origin ? d : { ...d, origin: label || `Lat ${lat.toFixed(3)}, Lng ${lng.toFixed(3)}`, originLat: lat, originLng: lng }))
        if (label) toast.success(`Planning from your exact location — ${label}`)
      },
      () => { setLocating(false) },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }, [])

  // The free AI model sometimes omits coordinates — backfill them from the
  // verified listings database and the known-towns table once available.
  // Only writes state when enrichment actually changed something, otherwise
  // an unfixable stop would re-trigger this effect forever.
  useEffect(() => {
    if (!draft.plan || !allListings) return
    // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
    if (!draft.plan.stops.some(s => s.lat == null || s.lng == null)) return
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
  // Show the consent opt-in only when neither the saved profile consent nor a
  // session flip exists yet.
  const consentPrompt = me?.trackingConsent !== true && !localConsent

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
      const coords = await geocodeArea(text, { countryCode: draft.traveler === 'foreigner' ? undefined : 'ke' })
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
  function applyModel(m: PlannerModel) {
    const town = TOWNS.find(t => t.name === m.origin)
    setDraft(d => ({
      ...d,
      // A model is a trip *template*, not an origin — planning must start
      // from where the traveller actually is. The model's origin only
      // applies when no real location is known yet (e.g. GPS was denied).
      origin: d.origin || m.origin,
      originLat: d.originLat ?? town?.lat,
      originLng: d.originLng ?? town?.lng,
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
          month: draft.travelMonth || undefined,
          candidates: pickPlanCandidates(allListings, draft.budget, draft.days, draft.originLat, draft.originLng),
        }),
      })
      // Check ok before parsing: platform errors return HTML bodies that would
      // otherwise blow up .json() and mask the real status.
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || 'Could not generate your plan')
      }
      const data = await response.json()
      const enriched = { ...data, stops: enrichStops(data.stops as Stop[], allListings) }
      // If the AI's plan still overshoots the budget (the API tolerates ~15%
      // overshoot before rejecting), never land on an over-budget itinerary —
      // send the traveller back to the budget stage so they can adjust and
      // the plan is regenerated to fit.
      const plannedTotal = (enriched.stops as Stop[]).reduce((sum, s) => sum + s.cost, 0)
      if (plannedTotal > draft.budget) {
        const orphanId = draft.tripId
        setDraft(d => ({ ...d, plan: null, tripId: null, published: false }))
        if (orphanId) {
          removeTrip({ id: orphanId }).catch(() => {})
        }
        goTo('budget', true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        toast.error(`Your plan came to ${formatKES(plannedTotal)} — ${formatKES(plannedTotal - draft.budget)} over your ${formatKES(draft.budget)} budget. Adjust the budget (or trip length) and we'll replan to fit it.`)
        return
      }
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
        originLat: draft.originLat,
        originLng: draft.originLng,
        traveler: draft.traveler,
        budget: draft.budget,
        days: draft.days,
        interests: draft.interests,
        pace: draft.pace,
        extra: draft.extra,
        month: draft.travelMonth || undefined,
        keptStops: dayStops.filter(s => s.locked).map(s => ({ title: s.title, place: s.place })),
        candidates: pickPlanCandidates(allListings, draft.budget, draft.days, draft.originLat, draft.originLng),
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => null)
      throw new Error(err?.error || 'Could not regenerate the plan')
    }
    const data = await response.json()
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
      // Local calendar dates, not UTC: an evening planner in EAT would
      // otherwise get a start date that's already "yesterday" in UTC.
      const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const id = await create({
        name: plan.name,
        destination: plan.destination,
        origin: draft.origin,
        traveler: draft.traveler ?? undefined,
        startDate: localDate(start),
        endDate: localDate(end),
        budget: draft.budget,
        totalCost: plan.stops.reduce((s, x) => s + x.cost, 0),
        // Persist the chosen travel month so the trip brief can read the
        // season directly instead of guessing from the created-at date.
        travelMonth: draft.travelMonth || undefined,
        stops: toTripStops(plan.stops),
      })
      setDraft(d => ({ ...d, tripId: id }))
      goTo('track', true)
      toast.success('Trip saved — live tracking is ready')
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.toLowerCase().includes('access')) {
        setPaywallOpen(true)
        toast.error('Your access has ended — pick a plan to continue')
      } else {
        toast.error('Could not save your trip')
      }
    } finally {
      setSaving(false)
    }
  }

  function handleSaveTrip() {
    if (!isSignedIn) {
      pendingFnRef.current = () => { void createTrip() }
      clerk.openSignIn()
      return
    }
    void createTrip()
  }

  function handleEditorSave(stops: Stop[]) {
    if (!plan) return
    setDraft(d => ({ ...d, plan: { ...d.plan!, stops } }))
    if (draft.tripId) {
      replaceStops({ tripId: draft.tripId, stops: toTripStops(stops) })
        .then(() => toast.success('Itinerary saved'))
        .catch(() => toast.error('Could not save changes'))
    }
  }

  /**
   * Swaps every night at a planned stay for a real nearby alternative from the
   * catalog. The new stop carries only real data (name, price, coords, photo),
   * and the stale routed drive times around it are cleared so nothing invented
   * lingers. The swap is allowed even if it pushes the total over budget — the
   * BudgetBar turns red so the traveller sees it, and they can adjust.
   */
  function handleSwapStay(indexes: number[], alt: Parameters<typeof stayPatch>[1]) {
    if (!plan) return
    const next = plan.stops.map((s, i) => {
      if (!indexes.includes(i)) return s
      return stayPatch(s, alt, plan.stops[i - 1])
    })
    // The leg into the following same-day stop changed too — clear it as well.
    const clearLeg = new Set<number>()
    for (const i of indexes) {
      for (let j = i + 1; j < next.length; j++) {
        if (next[j].day === next[i].day) { clearLeg.add(j); break }
      }
    }
    for (const j of clearLeg) {
      if (indexes.includes(j)) continue
      next[j] = { ...next[j], travelKm: undefined, travelMins: undefined, travelRouted: undefined }
    }

    const total = next.reduce((sum, s) => sum + s.cost, 0)
    const over = total > draft.budget
    const overage = over ? ` — ${formatKES(total - draft.budget)} over budget` : ''
    setDraft(d => (d.plan ? { ...d, plan: { ...d.plan, stops: next } } : d))
    if (draft.tripId) {
      replaceStops({ tripId: draft.tripId, stops: toTripStops(next) })
        .then(() => toast.success(`Swapped to ${alt.name}${overage}`))
        .catch(() => toast.error('Could not save the swap'))
    } else {
      toast.success(`Swapped to ${alt.name}${overage}`)
    }
  }

  /**
   * One-click "Add to plan" from the no-stay suggestions: appends a real
   * overnight stay on the last day of the trip, so a day-trip plan can
   * become an overnight one without regenerating anything.
   */
  function handleAddStay(alt: Parameters<typeof stayPatch>[1]) {
    if (!plan) return
    const last = plan.stops[plan.stops.length - 1]
    const prev = [...plan.stops].reverse().find(s => s.lat != null && s.lng != null)
    const stop = stayPatch(
      { day: last?.day ?? 1, time: '20:00', title: '', place: '', cost: 0, kind: 'Stay', locked: false },
      alt,
      prev,
    )
    const next = [...plan.stops, stop]
    const total = next.reduce((sum, s) => sum + s.cost, 0)
    const over = total > draft.budget
    const overage = over ? ` — ${formatKES(total - draft.budget)} over budget` : ''
    setDraft(d => (d.plan ? { ...d, plan: { ...d.plan, stops: next } } : d))
    if (draft.tripId) {
      replaceStops({ tripId: draft.tripId, stops: toTripStops(next) })
        .then(() => toast.success(`Added ${alt.name}${overage}`))
        .catch(() => toast.error('Could not save the stay'))
    } else {
      toast.success(`Added ${alt.name}${overage}`)
    }
  }

  // ─── Live tracking ────────────────────────────────────────────────────────

  function startTracking() {
    if (!draft.tripId || !plan) return
    if (!navigator.geolocation) { toast.error('Location is not supported'); return }
    // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
    if (destinationStop?.lat == null || destinationStop?.lng == null) { toast.error('This trip has no destination coordinates'); return }
    // Accept the optimistic local flip too — the server value lags a beat
    // after the user enables the switch, and gating on it alone dead-ends
    // the flow with no visible control.
    if (me?.trackingConsent !== true && !localConsent) {
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

  /** Optimistic consent flip — reverts only if the server rejects it. */
  function toggleConsent(v: boolean) {
    setLocalConsent(v)
    setConsent({ consent: v })
      .then(() => { if (v) toast.success('Location tracing enabled') })
      .catch(() => { setLocalConsent(false); toast.error('Could not update location consent') })
  }

  // ─── Share & publish ──────────────────────────────────────────────────────

  function onPickFiles(selected: FileList | null) {
    if (!selected) return
    const picked = Array.from(selected).slice(0, 8).map(file => ({ file, video: file.type.startsWith('video/') }))
    setFiles(prev => [...prev, ...picked].slice(0, 8))
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, j) => j !== index))
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
      clerk.openSignIn()
      return
    }
    void publish()
  }

  function resetSession() {
    // Ending the planner must not kill a live trace started elsewhere (e.g.
    // from a trip hub) — only stop tracking that belongs to THIS journey.
    if (!trackSession || (draft.tripId && trackSession.tripId === String(draft.tripId))) stopTracking()
    try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    setDraft(emptyDraft())
    setPrefilled(false)
    setFiles([])
    setCaption('')
    goTo('where')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy link')
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareToken = (savedTrip as { traceShareToken?: string } | null)?.traceShareToken
  const shareLink = `${siteOrigin}/moments/${draft.tripId}${shareToken ? `?t=${shareToken}` : ''}`
  const shareText = plan
    ? `I just explored ${plan.destination} with KenyaTrace${draft.rating ? ` and rated it ${draft.rating}/5` : ''}. Plan your own trip: ${shareLink}`
    : 'Plan your own Kenya trip with KenyaTrace'

  // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
  const mapPoints = useMemo(() => draft.plan?.stops
    ? draft.plan.stops.filter(s => s.lat != null && s.lng != null).map(s => ({ id: `${s.title}-${s.day}`, name: s.title, location: s.place, lat: s.lat!, lng: s.lng! }))
    : [], [draft.plan])

  // Stable identities so the map isn't rebuilt on every keystroke or slider move.
  const originPoints = useMemo(() =>
    draft.originLat != null && draft.originLng != null
      ? [{ id: 'origin', name: draft.origin || 'You are here', location: 'Your exact location', lat: draft.originLat, lng: draft.originLng }]
      : [],
    [draft.originLat, draft.originLng, draft.origin],
  )
  const originHighlight = useMemo(() => (draft.originLat != null ? ['origin'] : []), [draft.originLat])
  const originFocus = useMemo(() =>
    draft.originLat != null && draft.originLng != null ? { lat: draft.originLat, lng: draft.originLng, zoom: 11 } : undefined,
    [draft.originLat, draft.originLng],
  )

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

  const ctx: JourneyCtx = {
    isSignedIn: !!isSignedIn, router,
    draft, setDraft, stage, goTo,
    plan, destinationStop, allListings,

    locating, locError, manualArea, setManualArea, resolvingArea, locate, resolveArea, applyModel,
    originPoints, originHighlight, originFocus,

    prefilled, loading, progressStep, generatePlan,

    saving, adjustOpen, setAdjustOpen,
    handleSaveTrip, handleEditorSave, handleSwapStay, handleAddStay, replanDay,
    dayGroups, planMapPoints, planHighlight, planDestIds, mapRoute,

    activeSession, tracking, consentPrompt, localConsent, toggleConsent, startTracking, stopTracking,

    publishing, files, onPickFiles, removeFile, caption, setCaption,
    handlePublish, copied, copyShareLink, shareLink, shareText,

    resetSession,
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <JourneyProvider value={ctx}>
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-8">
        <PlannerProgress stage={stage} planName={plan?.name} />

        <div key={stage} className={animPhase ? `kt-step-${animPhase}` : `kt-step-${enterAnim}`}>
          {stage === 'where' && <WhereStage />}
          {stage === 'budget' && <BudgetStage />}
          {stage === 'plan' && <PlanStage />}
          {stage === 'track' && <TrackStage />}
          {stage === 'share' && <ShareStage />}
          {stage === 'done' && <DoneStage />}
        </div>
      </div>
    </JourneyProvider>
  )
}

const STAGE_ORDER: Stage[] = ['where', 'budget', 'plan', 'track', 'share', 'done']
