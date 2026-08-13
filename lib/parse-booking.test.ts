import { describe, expect, it } from 'vitest'
import { parseBookingEmail } from './parse-booking'

describe('parseBookingEmail', () => {
  it('extracts a hotel confirmation (property name, reference, KES amount, dates, guests)', () => {
    const text = `Dear Jane,

Your booking at the Sarova Stanley Hotel is confirmed.

Booking reference AB12CD
Check-in: 18 Aug 2026
Check-out: 21 Aug 2026
2 guests
Total KES 49,500`
    const parsed = parseBookingEmail(text)
    expect(parsed.type).toBe('Stay')
    expect(parsed.name).toBe('Sarova Stanley')
    expect(parsed.reference).toBe('AB12CD')
    expect(parsed.amount).toBe(49500)
    expect(parsed.currency).toBe('KES')
    expect(parsed.checkIn).toBe('2026-08-18')
    expect(parsed.checkOut).toBe('2026-08-21')
    expect(parsed.guests).toBe(2)
  })

  it('extracts a flight confirmation (flight type, PNR, USD amount, single date)', () => {
    const text = `Your flight KQ604 from Nairobi to Mombasa is confirmed.
PNR: ABC123
Departure 18 Aug 2026
Total USD 120`
    const parsed = parseBookingEmail(text)
    expect(parsed.type).toBe('Flight')
    expect(parsed.name).toContain('KQ604')
    expect(parsed.name).toContain('Nairobi to Mombasa')
    expect(parsed.reference).toBe('ABC123')
    expect(parsed.amount).toBe(120)
    expect(parsed.currency).toBe('USD')
    expect(parsed.checkIn).toBe('2026-08-18')
    expect(parsed.checkOut).toBeUndefined()
  })

  it('parses month-first dates and a generic paid amount', () => {
    const text = 'Check in August 18, 2026 at the Villa Rosa Kempinski. Booking ref: 7F3K9Q2. Paid 16500.'
    const parsed = parseBookingEmail(text)
    expect(parsed.type).toBe('Stay')
    expect(parsed.name).toBe('Villa Rosa Kempinski')
    expect(parsed.reference).toBe('7F3K9Q2')
    expect(parsed.amount).toBe(16500)
    expect(parsed.checkIn).toBe('2026-08-18')
  })

  it('parses ISO dates for check-in/check-out', () => {
    const text = 'Reservation at Leopard Beach Resort confirmed for 2026-08-18 to 2026-08-21. Booking number 8839201.'
    const parsed = parseBookingEmail(text)
    expect(parsed.type).toBe('Stay')
    expect(parsed.name).toBe('Leopard Beach')
    expect(parsed.reference).toBe('8839201')
    expect(parsed.checkIn).toBe('2026-08-18')
    expect(parsed.checkOut).toBe('2026-08-21')
  })

  it('detects transport confirmations', () => {
    const text = 'Your airport transfer from Mombasa to Diani Beach is booked. Pickup 18 Aug 2026 at 09:00. Driver: KCB. KSh 10,000.'
    const parsed = parseBookingEmail(text)
    expect(parsed.type).toBe('Transport')
    expect(parsed.amount).toBe(10000)
    expect(parsed.currency).toBe('KES')
    expect(parsed.checkIn).toBe('2026-08-18')
  })

  it('falls back gracefully on gibberish', () => {
    const parsed = parseBookingEmail('Hello world, this email contains nothing useful at all.')
    expect(parsed.name).toBe('Reserved booking')
    expect(parsed.type).toBe('General')
    expect(parsed.amount).toBe(0)
    expect(parsed.reference).toBeUndefined()
  })
})
