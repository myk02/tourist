import { describe, expect, it } from 'vitest'
import { TAXI_PLACES, estimateRoute, haversineKm } from './taxi-fares'

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm(-1.2864, 36.8172, -1.2864, 36.8172)).toBe(0)
  })

  it('computes a plausible JKIA → Nairobi CBD distance (~15 km)', () => {
    const km = haversineKm(-1.3192, 36.9278, -1.2864, 36.8172)
    expect(km).toBeGreaterThan(10)
    expect(km).toBeLessThan(20)
  })
})

describe('estimateRoute', () => {
  it('quotes every provider with a positive price', () => {
    const { quotes } = estimateRoute(TAXI_PLACES[0], TAXI_PLACES[2])
    expect(quotes.map(q => q.service)).toEqual(['uber', 'bolt', 'little', 'maramoja'])
    for (const q of quotes) expect(q.price).toBeGreaterThan(0)
  })

  it('prices an intercity run far above a city hop', () => {
    const city = estimateRoute(TAXI_PLACES[0], TAXI_PLACES[2]) // JKIA → CBD
    const intercity = estimateRoute(TAXI_PLACES[2], TAXI_PLACES[9]) // CBD → Naivasha
    expect(intercity.distanceKm).toBeGreaterThan(city.distanceKm * 4)
    const cheapestCity = Math.min(...city.quotes.map(q => q.price))
    const cheapestIntercity = Math.min(...intercity.quotes.map(q => q.price))
    expect(cheapestIntercity).toBeGreaterThan(cheapestCity * 3)
  })

  it('is symmetric in price — pickup/dropoff swap costs the same', () => {
    const a = estimateRoute(TAXI_PLACES[0], TAXI_PLACES[6])
    const b = estimateRoute(TAXI_PLACES[6], TAXI_PLACES[0])
    expect(a.quotes.map(q => q.price)).toEqual(b.quotes.map(q => q.price))
  })

  it('Bolt undercuts Uber on every route', () => {
    for (const [i, j] of [[0, 2], [2, 9], [6, 8]] as const) {
      const { quotes } = estimateRoute(TAXI_PLACES[i], TAXI_PLACES[j])
      const bolt = quotes.find(q => q.service === 'bolt')!
      const uber = quotes.find(q => q.service === 'uber')!
      expect(bolt.price).toBeLessThan(uber.price)
    }
  })
})
