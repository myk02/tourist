/**
 * Pure geo/tracking helpers shared by the live tracker, its floating widget
 * and the arrival detector. No browser or framework dependencies, so the
 * arrival logic can be unit-tested in isolation.
 */

import { haversineKm } from './travel'

/** Great-circle distance between two coordinates, in meters. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000
}

/** How far through the journey the traveller is, 0-100. */
export function progressPct(distanceToDest: number, startDistance: number): number {
  if (!Number.isFinite(startDistance) || startDistance <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((1 - distanceToDest / startDistance) * 100)))
}

// Arrival confirmation tolerances. GPS jitter is real — a single fix inside
// the radius proves nothing (a parked user can bounce 10-30 m), so a short
// streak of accurate fixes inside the fence is required before declaring
// "arrived".
export const ARRIVAL_RADIUS_M = 40
export const ARRIVAL_CONFIRMATIONS = 3
export const ARRIVAL_MAX_ACCURACY_M = 60

/**
 * Incremental arrival check. Returns the new streak and whether the trip is
 * now confirmed arrived. Low-accuracy fixes are treated as "no signal" and
 * reset the streak (they are too jittery to trust for a fence decision).
 */
export function arrivalState(
  destLat: number,
  destLng: number,
  lat: number,
  lng: number,
  accuracy: number,
  streak: number,
): { arrived: boolean; streak: number } {
  if (accuracy > ARRIVAL_MAX_ACCURACY_M) return { arrived: false, streak: 0 }
  if (distanceMeters(lat, lng, destLat, destLng) <= ARRIVAL_RADIUS_M) {
    const next = streak + 1
    return { arrived: next >= ARRIVAL_CONFIRMATIONS, streak: next }
  }
  return { arrived: false, streak: 0 }
}
