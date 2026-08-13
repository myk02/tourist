import { describe, expect, it } from 'vitest'
import { ARRIVAL_CONFIRMATIONS, ARRIVAL_MAX_ACCURACY_M, ARRIVAL_RADIUS_M, arrivalState, distanceMeters, progressPct } from './tracking'

// Nairobi → Maasai Mara is roughly 190 km as the crow flies.
const NAIROBI = { lat: -1.2921, lng: 36.8219 }
const MARA = { lat: -1.4, lng: 35.1333 }

describe('distanceMeters', () => {
  it('is ~0 for the same coordinate', () => {
    expect(distanceMeters(NAIROBI.lat, NAIROBI.lng, NAIROBI.lat, NAIROBI.lng)).toBeLessThan(0.001)
  })

  it('approximates the Nairobi → Mara distance (~190 km)', () => {
    const km = distanceMeters(NAIROBI.lat, NAIROBI.lng, MARA.lat, MARA.lng) / 1000
    expect(km).toBeGreaterThan(170)
    expect(km).toBeLessThan(210)
  })

  it('is symmetric', () => {
    const a = distanceMeters(NAIROBI.lat, NAIROBI.lng, MARA.lat, MARA.lng)
    const b = distanceMeters(MARA.lat, MARA.lng, NAIROBI.lat, NAIROBI.lng)
    expect(Math.abs(a - b)).toBeLessThan(0.001)
  })

  it('treats ~111 m per 0.001 degree of latitude as expected', () => {
    const m = distanceMeters(0, 36, 0.001, 36)
    expect(m).toBeGreaterThan(105)
    expect(m).toBeLessThan(115)
  })
})

describe('progressPct', () => {
  it('returns 0 when start distance is unknown', () => {
    expect(progressPct(500, 0)).toBe(0)
    expect(progressPct(500, -10)).toBe(0)
  })

  it('reports the right percentage at the halfway mark', () => {
    expect(progressPct(5000, 10000)).toBe(50)
  })

  it('clamps to 100 when at or past the destination', () => {
    expect(progressPct(0, 10000)).toBe(100)
    expect(progressPct(-200, 10000)).toBe(100)
  })

  it('clamps to 0 when the distance has not shrunk yet', () => {
    expect(progressPct(12000, 10000)).toBe(0)
  })
})

describe('arrivalState', () => {
  // A position exactly at the destination.
  const atDest = { lat: MARA.lat, lng: MARA.lng }

  it('needs ARRIVAL_CONFIRMATIONS consecutive fixes inside the radius', () => {
    let streak = 0
    let result = arrivalState(MARA.lat, MARA.lng, atDest.lat, atDest.lng, 10, streak)
    for (let i = 1; i < ARRIVAL_CONFIRMATIONS; i++) {
      expect(result.arrived).toBe(false)
      result = arrivalState(MARA.lat, MARA.lng, atDest.lat, atDest.lng, 10, result.streak)
    }
    expect(result.arrived).toBe(true)
  })

  it('resets the streak when the traveller leaves the radius', () => {
    const inside = { lat: MARA.lat + 0.0002, lng: MARA.lng } // ~22 m inside
    const insideResult = arrivalState(MARA.lat, MARA.lng, inside.lat, inside.lng, 10, 2)
    expect(insideResult.streak).toBe(3)

    const outside = { lat: MARA.lat + 0.001, lng: MARA.lng } // ~111 m out
    const outsideResult = arrivalState(MARA.lat, MARA.lng, outside.lat, outside.lng, 10, insideResult.streak)
    expect(outsideResult.arrived).toBe(false)
    expect(outsideResult.streak).toBe(0)
  })

  it('discards low-accuracy fixes instead of trusting them', () => {
    const result = arrivalState(MARA.lat, MARA.lng, atDest.lat, atDest.lng, ARRIVAL_MAX_ACCURACY_M + 1, 2)
    expect(result.arrived).toBe(false)
    expect(result.streak).toBe(0)
  })

  it('does not declare arrival from just outside the fence', () => {
    const justOutside = { lat: MARA.lat + 0.0006, lng: MARA.lng } // ~67 m out
    const result = arrivalState(MARA.lat, MARA.lng, justOutside.lat, justOutside.lng, 10, ARRIVAL_CONFIRMATIONS)
    expect(result.arrived).toBe(false)
    expect(result.streak).toBe(0)
  })

  it('uses a radius that is stricter than a GPS bounce', () => {
    expect(ARRIVAL_RADIUS_M).toBeLessThanOrEqual(60)
    expect(ARRIVAL_CONFIRMATIONS).toBeGreaterThanOrEqual(3)
  })
})
