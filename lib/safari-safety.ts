/**
 * Kenya safari safety + park intelligence — the single source of truth for
 * the Safety Centre and the park-fee estimator.
 *
 * All numbers are curated planning estimates (KWS 2024–2026 fee bands).
 * The UI labels them as estimates so travellers confirm at the gate.
 */

export interface EmergencyContact {
  name: string
  number: string
  telHref: string
  note: string
}

export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { name: 'National Emergency (Police / Fire / Ambulance)', number: '999 / 112', telHref: 'tel:999', note: 'Toll-free from any Kenyan line, 24/7.' },
  { name: 'Tourism Police', number: '+254 20 222 1111', telHref: 'tel:+254202221111', note: 'Visitor-targeted incidents, lodges & parks.' },
  { name: 'KWS (Kenya Wildlife Service)', number: '0800 597 000', telHref: 'tel:0800597000', note: 'Park emergencies, human–wildlife conflict.' },
  { name: 'AMREF Flying Doctors', number: '+254 20 699 2000', telHref: 'tel:+254206992000', note: 'Safari medical evacuation (Maasai Mara cover).' },
  { name: 'Red Cross Kenya', number: '1199', telHref: 'tel:1199', note: 'Disaster response & first aid.' },
]

export interface EmbassyContact {
  country: string
  phone: string
  telHref: string
}

export const EMBASSIES: EmbassyContact[] = [
  { country: 'USA', phone: '+254 20 363 6000', telHref: 'tel:+254203636000' },
  { country: 'UK', phone: '+254 20 284 4000', telHref: 'tel:+254202844000' },
  { country: 'Germany', phone: '+254 20 426 2100', telHref: 'tel:+254204262100' },
  { country: 'France', phone: '+254 20 277 8000', telHref: 'tel:+254202778000' },
  { country: 'Netherlands', phone: '+254 20 428 8000', telHref: 'tel:+254204288000' },
]

export interface ParkFee {
  park: string
  citizenKES: number
  residentKES: number
  nonResidentUSD: number
  note: string
}

export const PARK_FEES: ParkFee[] = [
  { park: 'Maasai Mara (Narok side)', citizenKES: 2000, residentKES: 2000, nonResidentUSD: 100, note: 'Peak Jul–Oct; book Sekenani/Talek gates early.' },
  { park: 'Amboseli', citizenKES: 1000, residentKES: 1000, nonResidentUSD: 60, note: 'Best at dawn for Kilimanjaro views.' },
  { park: 'Tsavo East / West', citizenKES: 1000, residentKES: 1000, nonResidentUSD: 60, note: 'Huge parks — carry water & fuel.' },
  { park: 'Lake Nakuru', citizenKES: 1000, residentKES: 1000, nonResidentUSD: 60, note: 'Rhino sanctuary; flamingo levels vary.' },
  { park: 'Nairobi National Park', citizenKES: 500, residentKES: 1000, nonResidentUSD: 50, note: 'Great half-day from the city.' },
  { park: 'Samburu / Buffalo Springs', citizenKES: 1000, residentKES: 1000, nonResidentUSD: 60, note: 'Special Five: Grevy’s zebra, gerenuk.' },
  { park: 'Diani / coast marine parks', citizenKES: 500, residentKES: 1000, nonResidentUSD: 25, note: 'Snorkel fees separate at Kisite.' },
]

export type Residency = 'citizen' | 'resident' | 'non-resident'

export function parkFeeEstimate(park: string, residency: Residency, days = 1): number | null {
  const row = PARK_FEES.find(p => p.park === park)
  if (!row) return null
  const d = Number.isFinite(days) && days > 0 ? Math.floor(days) : 1
  if (residency === 'non-resident') return row.nonResidentUSD * d
  return (residency === 'citizen' ? row.citizenKES : row.residentKES) * d
}

/** Bush-signal checklist shown when heading to low-coverage parks. */
export const BUSH_CHECKLIST: string[] = [
  'Load M-Pesa + carry KES 10,000–20,000 cash backup',
  'Download the itinerary PDF before leaving Nairobi/Nakuru',
  'Share the live-trace link with someone at home',
  'Save lodge, guide & AMREF numbers offline',
  'Fuel + water before entering Mara, Tsavo & Samburu',
]

/** Build an SMS body carrying the live-trace link + last GPS fix. */
export function sosMessage(traceUrl: string, lat?: number | null, lng?: number | null): string {
  const coords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? ` Last fix: ${lat.toFixed(5)}, ${lng.toFixed(5)} (https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)})`
      : ''
  return `SOS — I need help on my Kenya trip. Follow my live trace: ${traceUrl}.${coords} Please call me back.`
}
