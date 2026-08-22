/**
 * Route-ordering hints for itinerary days. Pure geometry: straight-line
 * (haversine) distances compare the day's current stop order against a
 * locked-aware nearest-neighbour walk. Nothing here calls OSRM or mutates
 * anything — the editor decides whether a saving is worth showing and always
 * leaves the traveller in control of the final order.
 */

import { haversineKm } from './travel'

export interface OptimizableStop {
  lat?: number | null
  lng?: number | null
  locked?: boolean
}

/** Sum of straight-line legs between consecutive geocoded stops, in order. */
export function pathLengthKm(stops: OptimizableStop[]): number {
  let total = 0
  let prev: OptimizableStop | null = null
  for (const s of stops) {
    // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
    if (s.lat == null || s.lng == null) continue
    if (prev?.lat != null && prev?.lng != null) total += haversineKm(prev.lat, prev.lng, s.lat, s.lng)
    prev = s
  }
  return total
}

function dist(a: OptimizableStop, b: OptimizableStop): number {
  return haversineKm(a.lat!, a.lng!, b.lat!, b.lng!)
}

/**
 * Nearest-neighbour order for one day, returned as a permutation of input
 * indices. Locked stops keep their exact positions; each unlocked *run*
 * between anchors is greedily ordered starting from the preceding stop's
 * coordinates, so a pinned lunch stop never moves but the detours around it
 * disappear. Stops without coordinates never move.
 */
export function optimizedOrder<T extends OptimizableStop>(dayStops: T[]): number[] {
  const n = dayStops.length
  const order = Array.from({ length: n }, (_, i) => i)
  // Split into runs of consecutive unlocked, geocoded stops.
  let i = 0
  while (i < n) {
    const movable = !dayStops[i].locked && dayStops[i].lat != null && dayStops[i].lng != null
    if (!movable) { i++; continue }
    const start = i
    while (i < n && !dayStops[i].locked && dayStops[i].lat != null && dayStops[i].lng != null) i++
    // Anchor coordinates: the stop just before the run (or nothing for a
    // leading run — then its own first stop anchors the walk).
    const anchor = start > 0 ? dayStops[start - 1] : null
    const runIdx = order.slice(start, i)
    const pool = [...runIdx]
    const ordered: number[] = []
    while (pool.length) {
      let bestPos = 0
      if (anchor || ordered.length) {
        const refIdx = ordered.length ? ordered[ordered.length - 1] : null
        const ref = refIdx != null ? dayStops[refIdx] : anchor!
        let bestDist = Infinity
        for (let p = 0; p < pool.length; p++) {
          const d = dist(ref, dayStops[pool[p]])
          if (d < bestDist) { bestDist = d; bestPos = p }
        }
      }
      ordered.push(pool.splice(bestPos, 1)[0])
    }
    for (let k = 0; k < ordered.length; k++) order[start + k] = ordered[k]
  }
  return order
}

/** Minimum interestingness for a hint: at least ~15% shorter AND ≥2 km saved,
 *  with enough stops for order to actually matter. */
const MIN_STOPS = 3
const MIN_SAVINGS_PCT = 0.15
const MIN_SAVINGS_KM = 2

export interface DayHint {
  currentKm: number
  optimizedKm: number
  savingsKm: number
  savingsPct: number
  /** Permutation of input indices produced by optimizedOrder. */
  order: number[]
}

/** A day is worth flagging when reordering meaningfully shortens it. */
export function dayOptimizationHint<T extends OptimizableStop>(dayStops: T[]): DayHint | null {
  const geoCount = dayStops.filter(s => s.lat != null && s.lng != null).length
  if (geoCount < MIN_STOPS) return null
  const currentKm = pathLengthKm(dayStops)
  if (currentKm <= 0) return null
  const order = optimizedOrder(dayStops)
  const optimizedKm = pathLengthKm(order.map(i => dayStops[i]))
  const savingsKm = currentKm - optimizedKm
  const savingsPct = currentKm > 0 ? savingsKm / currentKm : 0
  if (savingsKm < MIN_SAVINGS_KM || savingsPct < MIN_SAVINGS_PCT) return null
  return { currentKm, optimizedKm, savingsKm, savingsPct, order }
}
