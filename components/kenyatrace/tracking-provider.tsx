'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { arrivalState, distanceMeters, progressPct } from '@/lib/tracking'

export type TrackingStatus = 'tracking' | 'arrived'

export interface TrackingSession {
  tripId: string
  tripName: string
  destinationName: string
  destLat: number
  destLng: number
  originLabel?: string
  status: TrackingStatus
  lastPoint: { lat: number; lng: number; accuracy: number } | null
  /** [lng, lat] pairs in arrival order — drawn as the live trace. */
  path: [number, number][]
  distanceKm: number | null
  progressPct: number
  startedAt: number
  arrivedAt?: number
  /** Epoch ms of the last accepted GPS fix — lets the UI show staleness
   *  honestly instead of silently stalling when fixes stop arriving. */
  lastFixAt?: number
  /** Straight-line distance to the destination on the first fix, km-derived.
   *  Persisted with the session so progress survives a reload (it anchors the
   *  progress bar at the moment tracking started, not the moment the page
   *  reloaded). */
  startDistance?: number | null
}

const STORAGE_KEY = 'ktActiveTrack'
/** Cross-tab claim so two browser tabs never double-record the same trail. */
const TAB_LOCK_KEY = 'ktActiveTrackLock'
const TAB_LOCK_TTL_MS = 15000

/** Collision-resistant tab id (crypto when available, Math fallback for old browsers). */
function newTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `t-${crypto.randomUUID()}`
  } catch { /* ignore */ }
  return `t-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

interface TrackingContextValue {
  session: TrackingSession | null
  start: (args: { tripId: string; tripName: string; destinationName: string; destLat: number; destLng: number; originLabel?: string }) => void
  stop: () => void
}

const TrackingContext = createContext<TrackingContextValue | null>(null)

export function useTracking(): TrackingContextValue {
  const ctx = useContext(TrackingContext)
  if (!ctx) throw new Error('useTracking must be used within TrackingProvider')
  return ctx
}

/**
 * Owns the trip's geolocation session for its whole lifetime. The provider
 * lives in the app layout, so the watchPosition callback keeps firing across
 * client-side route changes — that is what lets tracking continue in a
 * minimal pinned widget while the user browses Discover or anything else.
 */
export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const record = useMutation(api.positions.record)

  const [session, setSession] = useState<TrackingSession | null>(null)
  const sessionRef = useRef<TrackingSession | null>(null)
  sessionRef.current = session

  const watchIdRef = useRef<number | null>(null)
  const arrivalStreakRef = useRef(0)
  const arrivalNavigatedRef = useRef(false)
  const lastRecordedRef = useRef<{ lat: number; lng: number; at: number } | null>(null)
  const lastPersistedRef = useRef<{ at: number; status: TrackingStatus | null }>({ at: 0, status: null })
  // This browser tab's identity for the cross-tab lock (stable across renders).
  const tabIdRef = useRef<string>('')
  // Warn once per session when trail persistence starts failing — never spam.
  const recordWarnedRef = useRef(false)

  // Hydration-safe restore: storage is only read after mount, so the server
  // and client first renders always agree.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const restored = JSON.parse(raw) as TrackingSession
        setSession(prev => prev ?? restored)
        // A session restored mid-arrival must not re-fire the auto-navigation
        // to the track page on every reload — it already fired once.
        if (restored.status === 'arrived') arrivalNavigatedRef.current = true
      }
    } catch { /* ignore */ }
  }, [])

  // Persist throttled — a fix arrives roughly every second and serializing the
  // whole (growing) session each time is wasteful. Write on status changes and
  // at most every few seconds otherwise; worst case a reload loses seconds of
  // path. The same write heartbeats this tab's cross-tab claim.
  useEffect(() => {
    try {
      if (!session) {
        localStorage.removeItem(STORAGE_KEY)
        lastPersistedRef.current = { at: 0, status: null }
        return
      }
      const now = Date.now()
      const statusChanged = lastPersistedRef.current.status !== session.status
      if (statusChanged || now - lastPersistedRef.current.at > 4000) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
        lastPersistedRef.current = { at: now, status: session.status }
        if (session.status === 'tracking' && tabIdRef.current) {
          localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ tabId: tabIdRef.current, at: now }))
        }
      }
    } catch { /* ignore */ }
  }, [session])

  // Release this tab's claim when it closes or navigates away mid-session so
  // another tab can take over immediately instead of waiting out the TTL.
  useEffect(() => {
    tabIdRef.current = newTabId()
    const release = () => {
      try {
        const raw = localStorage.getItem(TAB_LOCK_KEY)
        if (raw && (JSON.parse(raw) as { tabId?: string }).tabId === tabIdRef.current) {
          localStorage.removeItem(TAB_LOCK_KEY)
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [])

  const start = useCallback((args: { tripId: string; tripName: string; destinationName: string; destLat: number; destLng: number; originLabel?: string }) => {
    if (!('geolocation' in navigator)) {
      toast.error('Location is not supported by this browser — tracking is unavailable')
      return
    }
    // Cross-tab guard: a fresh claim from another tab means tracking already
    // runs there — starting here too would double-record every point.
    try {
      const raw = localStorage.getItem(TAB_LOCK_KEY)
      const lock = raw ? (JSON.parse(raw) as { tabId?: string; at?: number }) : null
      if (!tabIdRef.current) tabIdRef.current = newTabId()
      if (lock?.tabId && lock.tabId !== tabIdRef.current && Date.now() - (lock.at ?? 0) < TAB_LOCK_TTL_MS) {
        toast.error('Live tracking is already running in another tab')
        return
      }
      localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ tabId: tabIdRef.current, at: Date.now() }))
    } catch { /* ignore */ }
    arrivalStreakRef.current = 0
    arrivalNavigatedRef.current = false
    lastRecordedRef.current = null
    recordWarnedRef.current = false
    setSession({
      tripId: args.tripId,
      tripName: args.tripName,
      destinationName: args.destinationName,
      destLat: args.destLat,
      destLng: args.destLng,
      originLabel: args.originLabel,
      status: 'tracking',
      lastPoint: null,
      path: [],
      distanceKm: null,
      progressPct: 0,
      startedAt: Date.now(),
      startDistance: null,
    })
  }, [])

  const stop = useCallback(() => {
    setSession(null)
    try {
      const raw = localStorage.getItem(TAB_LOCK_KEY)
      if (raw && (JSON.parse(raw) as { tabId?: string }).tabId === tabIdRef.current) {
        localStorage.removeItem(TAB_LOCK_KEY)
      }
    } catch { /* ignore */ }
  }, [])

  // Single watch per active session. The cleanup + StrictMode double-invoke
  // cancel out safely: at most one watch is ever left running.
  useEffect(() => {
    const active = session?.status === 'tracking' && 'geolocation' in navigator
    if (!active) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }
    if (watchIdRef.current !== null) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        const s = sessionRef.current
        if (!s) return
        const { latitude: lat, longitude: lng, accuracy } = position.coords
        const distance = distanceMeters(lat, lng, s.destLat, s.destLng)
        const arrival = arrivalState(s.destLat, s.destLng, lat, lng, accuracy, arrivalStreakRef.current)
        arrivalStreakRef.current = arrival.streak
        setSession(prev => {
          if (!prev) return prev
          // Anchor progress at the first fix of the session; once set it's
          // persisted with the session so reloads don't reset the bar.
          const base = prev.startDistance ?? distance
          const last = prev.path[prev.path.length - 1]
          const path: [number, number][] = last && last[0] === lng && last[1] === lat ? prev.path : [...prev.path, [lng, lat]]
          const next: TrackingSession = {
            ...prev,
            startDistance: base,
            lastPoint: { lat, lng, accuracy },
            path,
            lastFixAt: Date.now(),
            // A malformed fix (NaN from a transient GPS glitch) must never
            // reach the UI's toFixed() and throw.
            distanceKm: Number.isFinite(distance) ? Math.round((distance / 1000) * 10) / 10 : prev.distanceKm,
            progressPct: Number.isFinite(distance) ? progressPct(distance, base) : prev.progressPct,
          }
          if (arrival.arrived && prev.status === 'tracking') {
            next.status = 'arrived'
            next.arrivedAt = Date.now()
            next.progressPct = 100
          }
          return next
        })
        // Persist to the trip's trace roughly every 5s, only when moving.
        const lastRecorded = lastRecordedRef.current
        const now = Date.now()
        const moved = !lastRecorded || distanceMeters(lastRecorded.lat, lastRecorded.lng, lat, lng) > 30
        const beenAWhile = !lastRecorded || now - lastRecorded.at > 5000
        if (moved && beenAWhile) {
          lastRecordedRef.current = { lat, lng, at: now }
          record({ tripId: s.tripId as Id<'trips'>, lat, lng, accuracy }).catch(() => {
            // Silent loss used to mean the trace quietly never persisted. Tell
            // the traveller once per session so they can check connectivity.
            if (!recordWarnedRef.current) {
              recordWarnedRef.current = true
              toast.warning('Your route may not be saving — check your connection')
            }
          })
        }
      },
      error => {
        // A hard permission denial (or GPS fully unavailable) would otherwise
        // leave the session stuck at 0% forever with no way out — end it
        // visibly instead of silently. Transient fix errors (unavailable,
        // timeout) keep the session running; the UI shows staleness via
        // lastFixAt instead of pretending everything is fine.
        if (error && error.code === 1 /* PERMISSION_DENIED */) {
          setSession(null)
          toast.error('Location permission was denied — tracking stopped')
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [session?.tripId, session?.status, record])

  // Arrival: bring up the full live-tracking page once, so the user can
  // continue with the (optional) sharing flow.
  useEffect(() => {
    if (session?.status !== 'arrived' || arrivalNavigatedRef.current) return
    arrivalNavigatedRef.current = true
    const target = `/trips/${session.tripId}/track`
    if (pathname !== target) router.push(target)
  }, [session?.status, session?.tripId, pathname, router])

  const value = useMemo(() => ({ session, start, stop }), [session, start, stop])
  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>
}
