import { describe, expect, it } from 'vitest'
import { dayOptimizationHint, optimizedOrder, pathLengthKm } from './route-optimize'

// Stops strung along the equator: 1° of longitude ≈ 111 km straight-line.
const eq = (lng: number, extra: Partial<{ locked: boolean }> = {}) => ({ lat: 0, lng, ...extra })

describe('pathLengthKm', () => {
  it('sums consecutive legs in order and skips ungeocoded stops', () => {
    const stops = [eq(36.8), eq(36.9), { lat: null, lng: null }, eq(37.0)]
    // Two legs of ~0.1° each.
    expect(pathLengthKm(stops)).toBeCloseTo(pathLengthKm([eq(36.8), eq(37.0)]), 5)
    expect(pathLengthKm([])).toBe(0)
  })
})

describe('optimizedOrder', () => {
  it('greedily orders unlocked stops without locks', () => {
    const stops = [eq(36.8), eq(37.2), eq(36.9), eq(37.1)]
    // From 36.8: 36.9 is nearest, then 37.1, then 37.2.
    expect(optimizedOrder(stops)).toEqual([0, 2, 3, 1])
  })

  it('pins locked stops and optimizes the runs between them', () => {
    const stops = [eq(36.8), eq(37.0, { locked: true }), eq(37.3), eq(37.15)]
    const order = optimizedOrder(stops)
    expect(order[1]).toBe(1) // locked stop never moves
    expect(order[0]).toBe(0)
    // After the anchor at 37.0, 37.15 comes before 37.3.
    expect(order.slice(2)).toEqual([3, 2])
  })

  it('leaves ungeocoded stops untouched', () => {
    const stops: { lat?: number | null; lng?: number | null }[] = [{ lat: null, lng: null }, eq(36.8), eq(37.0)]
    expect(optimizedOrder(stops)).toEqual([0, 1, 2])
  })
})

describe('dayOptimizationHint', () => {
  it('flags a zig-zagging day with its saving', () => {
    const hint = dayOptimizationHint([eq(36.8), eq(37.2), eq(36.9), eq(37.1)])
    expect(hint).not.toBeNull()
    expect(hint!.order).toEqual([0, 2, 3, 1])
    expect(hint!.savingsPct).toBeGreaterThan(0.15)
    expect(hint!.savingsKm).toBeGreaterThan(2)
    expect(hint!.optimizedKm).toBeLessThan(hint!.currentKm)
  })

  it('returns null for days too short to matter', () => {
    expect(dayOptimizationHint([eq(36.8), eq(37.0)])).toBeNull()
  })

  it('returns null when the current order is already sensible', () => {
    expect(dayOptimizationHint([eq(36.8), eq(36.9), eq(37.0)])).toBeNull()
  })

  it('returns null when a locked stop forces the detour', () => {
    // The only short ordering requires moving the locked stop — no hint.
    const stops = [eq(37.0, { locked: true }), eq(36.8), eq(37.2)]
    expect(dayOptimizationHint(stops)).toBeNull()
  })
})
