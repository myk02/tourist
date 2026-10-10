import { describe, expect, it } from 'vitest'
import { BUSH_CHECKLIST, EMERGENCY_CONTACTS, PARK_FEES, parkFeeEstimate, sosMessage } from './safari-safety'
import { filterPhrases } from './swahili'
import { buildGpx, gpxFilename, slugify } from './gpx'

describe('safari-safety', () => {
  it('has callable emergency numbers', () => {
    expect(EMERGENCY_CONTACTS.length).toBeGreaterThanOrEqual(4)
    for (const c of EMERGENCY_CONTACTS) expect(c.telHref.startsWith('tel:')).toBe(true)
  })

  it('estimates park fees per residency', () => {
    expect(parkFeeEstimate('Amboseli', 'citizen', 1)).toBe(1000)
    expect(parkFeeEstimate('Amboseli', 'non-resident', 2)).toBe(120)
    expect(parkFeeEstimate('Unknown park', 'citizen')).toBeNull()
  })

  it('builds an SOS message with maps link when coords exist', () => {
    const msg = sosMessage('https://x/trace/1?t=abc', -1.2921, 36.8219)
    expect(msg).toContain('SOS')
    expect(msg).toContain('maps.google.com')
    expect(sosMessage('https://x')).toContain('live trace')
  })

  it('has a bush checklist', () => {
    expect(BUSH_CHECKLIST.length).toBeGreaterThanOrEqual(4)
    expect(PARK_FEES.length).toBeGreaterThanOrEqual(5)
  })
})

describe('swahili', () => {
  it('filters by category and query', () => {
    expect(filterPhrases('', 'All').length).toBeGreaterThanOrEqual(10)
    expect(filterPhrases('', 'Help').every(p => p.category === 'Help')).toBe(true)
    expect(filterPhrases('m-pesa', 'All').length).toBeGreaterThanOrEqual(1)
    expect(filterPhrases('elephant', 'All').length).toBeGreaterThanOrEqual(1)
  })
})

describe('gpx', () => {
  it('builds valid GPX with waypoints and track', () => {
    const gpx = buildGpx('Mara trip', [
      { name: 'Nairobi', lat: -1.2921, lng: 36.8219, day: 1 },
      { name: 'Sekinani Gate', place: 'Maasai Mara', lat: -1.5, lng: 35.4, day: 2 },
      { name: 'No coords' },
    ])
    expect(gpx).toContain('<gpx')
    expect(gpx).toContain('<wpt')
    expect(gpx).toContain('<trkseg>')
    expect(gpx).not.toContain('No coords')
  })

  it('slugifies filenames', () => {
    expect(slugify('Maasai Mara & Diani!')).toBe('maasai-mara-diani')
    expect(gpxFilename('Mara trip')).toBe('mara-trip.gpx')
  })
})
