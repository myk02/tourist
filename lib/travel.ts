/**
 * Travel-time helpers for the planner. Where possible we ask the free OSRM
 * public routing server for a real road distance + duration; when that is
 * unavailable (network, rate limit, or no coords) we fall back to a straight-
 * line estimate at ~45 km/h with a small overhead for stops. This keeps every
 * itinerary row honest: "OSRM: 2h05m" is a real drive, "est. 1h30m" is math.
 */

const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving/'
/** Average road speed used by the fallback estimate (Kenyan highways/mixed). */
const ESTIMATE_KMH = 45
/** Overhead applied to the fallback for traffic lights, stops and congestion. */
const ESTIMATE_OVERHEAD = 1.15
const OSRM_TIMEOUT_MS = 6000

export type LegResult = { km: number; mins: number; route: 'osrm' | 'estimate' }

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Straight-line estimate: km at a flat road speed plus overhead. */
export function estimateLeg(from: { lat: number; lng: number }, to: { lat: number; lng: number }): LegResult {
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng)
  const mins = Math.max(1, Math.round((km / ESTIMATE_KMH) * 60 * ESTIMATE_OVERHEAD))
  return { km: Math.max(0, Math.round(km)), mins, route: 'estimate' }
}

/** Real road distance/duration via OSRM, falling back to the estimate. */
export async function drivingLeg(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<LegResult> {
  try {
    const url = `${OSRM_ENDPOINT}${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
    const res = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) })
    if (!res.ok) return estimateLeg(from, to)
    const data = await res.json()
    const route = data?.routes?.[0]
    if (route && typeof route.distance === 'number' && typeof route.duration === 'number') {
      const km = Math.round(route.distance / 1000)
      // OSRM can report 0 for same-coordinate pairs; a real 0-km leg means "here".
      return { km, mins: Math.max(0, Math.round(route.duration / 60)), route: 'osrm' }
    }
    return estimateLeg(from, to)
  } catch {
    return estimateLeg(from, to)
  }
}

/**
 * Runs up to `concurrency` async jobs at once — used to batch the plan's
 * travel legs so we don't hammer the free OSRM endpoint with a parallel burst.
 */
export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!items.length) return []
  const safeConcurrency = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length))
  const out = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      if (i >= items.length) break
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: safeConcurrency }, worker))
  return out
}
