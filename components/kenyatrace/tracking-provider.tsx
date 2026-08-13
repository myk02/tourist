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
  /** Straight-line distance to the destination on the first fix, km-derived.
   *  Persisted with the session so progress survives a reload (it anchors the
   *  progress bar at the moment tracking started, not the moment the page
   *  reloaded). */
  startDistance?: number | null
}

const STORAGE_KEY = 'ktActiveTrack'

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

  // Hydration-safe restore: storage is only read after mount, so the server
  // and client first renders always agree.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSession(prev => prev ?? (JSON.parse(raw) as TrackingSession))
    } catch { /* ignore */ }
  }, [])

  // Persist throttled — a fix arrives roughly every second and serializing the
  // whole (growing) session each time is wasteful. Write on status changes and
  // at most every few seconds otherwise; worst case a reload loses seconds of path.
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
      }
    } catch { /* ignore */ }
  }, [session])

  const start = useCallback((args: { tripId: string; tripName: string; destinationName: string; destLat: number; destLng: number; originLabel?: string }) => {
    arrivalStreakRef.current = 0
    arrivalNavigatedRef.current = false
    lastRecordedRef.current = null
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
          void record({ tripId: s.tripId as Id<'trips'>, lat, lng, accuracy }).catch(() => {})
        }
      },
      error => {
        // A hard permission denial (or GPS fully unavailable) would otherwise
        // leave the session stuck at 0% forever with no way out — end it
        // visibly instead of silently. Transient fix errors are fine.
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
