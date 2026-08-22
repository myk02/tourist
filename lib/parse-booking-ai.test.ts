import { describe, expect, it } from 'vitest'
import { mergeParsedBooking, regexParseIsWeak, sanitizeAiBooking } from './parse-booking-ai'
import { parseBookingEmail } from './parse-booking'

describe('sanitizeAiBooking', () => {
  it('keeps clean values and drops everything the model must not invent', () => {
    const out = sanitizeAiBooking({
      name: '  Sarova Stanley Hotel  ',
      place: 'Nairobi',
      type: 'Stay',
      reference: 'AB12CD',
      amount: '49,500',
      currency: 'KES',
      checkIn: '2026-08-18',
      checkOut: '2026-08-21',
      guests: '2',
      provider: 'Sarova',
    })
    expect(out).toEqual({
      name: 'Sarova Stanley Hotel',
      place: 'Nairobi',
      type: 'Stay',
      reference: 'AB12CD',
      amount: 49500,
      currency: 'KES',
      checkIn: '2026-08-18',
      checkOut: '2026-08-21',
      guests: 2,
      provider: 'Sarova',
    })
  })

  it('rejects malformed dates, absurd amounts, bad types and junk strings', () => {
    const out = sanitizeAiBooking({
      name: 'x',
      place: 42 as unknown as string,
      type: 'Spaceship',
      reference: null,
      amount: -5,
      currency: 'BTC',
      checkIn: '18/08/2026',
      checkOut: '1999-01-01',
      guests: 0,
      provider: '',
    })
    expect(out).toEqual({})
  })

  it('caps runaway strings', () => {
    const out = sanitizeAiBooking({ name: 'A'.repeat(500), reference: 'R'.repeat(100) })
    expect(out.name?.length).toBe(80)
    expect(out.reference?.length).toBe(24)
  })
})

describe('regexParseIsWeak', () => {
  it('is false when the regex found the essentials', () => {
    const parsed = parseBookingEmail('Your booking at the Sarova Stanley Hotel is confirmed. Booking reference AB12CD. Check-in 18 Aug 2026. Total KES 49,500.')
    expect(regexParseIsWeak(parsed)).toBe(false)
  })

  it('is true when fields are missing or the name is the generic fallback', () => {
    expect(regexParseIsWeak({ name: 'Reserved booking', type: 'General', amount: 0 })).toBe(true)
    expect(regexParseIsWeak({ name: 'KQ604 · Nairobi to Mombasa', type: 'Flight', amount: 120, reference: undefined, checkIn: undefined })).toBe(true)
  })
})

describe('mergeParsedBooking', () => {
  const base = parseBookingEmail('Your booking at the Sarova Stanley Hotel is confirmed.\nBooking reference AB12CD\nCheck-in: 18 Aug 2026\nTotal KES 49,500')

  it('never overwrites a confident regex hit', () => {
    const merged = mergeParsedBooking(base, { name: 'Wrong Name', amount: 1, reference: 'FAKE123' })
    expect(merged.name).toBe(base.name)
    expect(merged.amount).toBe(49500)
    expect(merged.reference).toBe('AB12CD')
  })

  it('fills only the gaps (and upgrades the generic fallback name)', () => {
    const weak = parseBookingEmail('See you on 18 Aug 2026.')
    const merged = mergeParsedBooking(weak, {
      name: 'Baobab Beach Resort',
      place: 'Diani',
      reference: 'XY9988Z',
      amount: 32000,
      guests: 2,
    })
    expect(merged.name).toBe('Baobab Beach Resort')
    expect(merged.provider).toBe('Baobab Beach Resort')
    expect(merged.place).toBe('Diani')
    expect(merged.reference).toBe('XY9988Z')
    expect(merged.amount).toBe(32000)
    expect(merged.checkIn).toBe(weak.checkIn)
  })

  it('returns an equal result when the AI added nothing usable', () => {
    const merged = mergeParsedBooking(base, {})
    expect(merged).toEqual(base)
  })
})
