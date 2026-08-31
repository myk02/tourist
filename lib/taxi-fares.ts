import { haversineKm } from './travel'

/**
 * Taxi fare engine — shared by the Discover → Taxis estimator UI.
 *
 * Fares are modelled on published Kenya ride-hailing economics (base fare +
 * per-km + per-minute). They are honest ESTIMATES: real prices vary with
 * traffic, surge and time of day, which every quote states explicitly.
 *
 * Distance uses the canonical haversine from lib/travel.ts.
 */

export type TaxiPlace = { name: string; area: string; lat: number; lng: number }

/** Common pickup/dropoff points across Kenya with real coordinates. */
export const TAXI_PLACES: TaxiPlace[] = [
  { name: 'JKIA (NBO)', area: 'Nairobi', lat: -1.3192, lng: 36.9278 },
  { name: 'Wilson Airport', area: 'Nairobi', lat: -1.3217, lng: 36.8148 },
  { name: 'Nairobi CBD', area: 'Nairobi', lat: -1.2864, lng: 36.8172 },
  { name: 'Westlands', area: 'Nairobi', lat: -1.2641, lng: 36.8046 },
  { name: 'Karen', area: 'Nairobi', lat: -1.31, lng: 36.72 },
  { name: 'Mombasa Road', area: 'Nairobi', lat: -1.33, lng: 36.87 },
  { name: 'Moi Intl Airport (MBA)', area: 'Mombasa', lat: -4.0347, lng: 39.5942 },
  { name: 'Mombasa CBD', area: 'Mombasa', lat: -4.0612, lng: 39.6694 },
  { name: 'Diani Beach', area: 'Kwale', lat: -4.2792, lng: 39.5947 },
  { name: 'Naivasha', area: 'Nakuru', lat: -0.7172, lng: 36.431 },
  { name: 'Nakuru Town', area: 'Nakuru', lat: -0.3031, lng: 36.08 },
  { name: 'Kisumu', area: 'Kisumu', lat: -0.0917, lng: 34.768 },
]

export type TaxiServiceKey = 'uber' | 'bolt' | 'little' | 'maramoja'

type ServiceRate = { perKm: number; base: number; perMin: number; name: string; rating: number; reviews: number }

const SERVICE_RATES: Record<TaxiServiceKey, ServiceRate> = {
  uber: { perKm: 130, base: 100, perMin: 4, name: 'Uber', rating: 4.6, reviews: 25000 },
  bolt: { perKm: 110, base: 70, perMin: 3, name: 'Bolt', rating: 4.4, reviews: 18000 },
  little: { perKm: 120, base: 80, perMin: 4, name: 'Little Cab', rating: 4.5, reviews: 8000 },
  maramoja: { perKm: 125, base: 100, perMin: 3, name: 'Maramoja', rating: 4.3, reviews: 3000 },
}

// Re-export canonical haversine for callers that previously imported from here.
export { haversineKm }

export type TaxiQuote = {
  service: TaxiServiceKey
  name: string
  price: number
  rating: number
  reviews: number
  tagline: string
}

export type TaxiRouteEstimate = {
  distanceKm: number
  durationMin: number
  quotes: TaxiQuote[]
}

/**
 * Estimates every provider's fare for a route. Average Nairobi city speed
 * (~24 km/h door to door) drives the minutes term; intercity runs cruise
 * faster, so long routes get a highway-adjusted duration.
 */
export function estimateRoute(pickup: TaxiPlace, dropoff: TaxiPlace): TaxiRouteEstimate {
  const distanceKm = haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng)
  const avgSpeed = distanceKm > 40 ? 55 : distanceKm > 15 ? 35 : 24
  const durationMin = Math.max(5, Math.ceil((distanceKm / avgSpeed) * 60))

  const quotes = (Object.entries(SERVICE_RATES) as [TaxiServiceKey, ServiceRate][]).map(([key, rate]) => ({
    service: key,
    name: rate.name,
    price: Math.round(rate.base + distanceKm * rate.perKm + durationMin * rate.perMin),
    rating: rate.rating,
    reviews: rate.reviews,
    tagline:
      key === 'bolt'
        ? 'Usually the cheapest'
        : key === 'uber'
          ? 'Most available'
          : key === 'little'
            ? 'Local favourite'
            : 'Nairobi-born app',
  }))

  return { distanceKm, durationMin, quotes }
}
