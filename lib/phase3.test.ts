import { describe, expect, it } from 'vitest'
import { isEmail, normalizeEmail } from './email'
import { chargeMatches, fromMinorKES, toMinorKES } from './money'
import { checkInMs, dayFromDate, daysUntil, prettyDate, stayNights } from './dates'
import { buildReminderEmail } from './reminder-email'

describe('isEmail / normalizeEmail', () => {
  it('accepts valid addresses and rejects junk', () => {
    expect(isEmail('jane@example.com')).toBe(true)
    expect(isEmail('  Jane@Example.COM  ')).toBe(true)
    expect(isEmail('not-an-email')).toBe(false)
    expect(isEmail('a@b')).toBe(false)
  })
  it('normalizes for storage and comparison', () => {
    expect(normalizeEmail('  Jane@Example.COM  ')).toBe('jane@example.com')
  })
})

describe('KES minor units', () => {
  it('round-trips through Paystack minor units', () => {
    expect(toMinorKES(2500)).toBe(250000)
    expect(fromMinorKES(250000)).toBe(2500)
  })
  it('matches charges only on exact amount + currency', () => {
    expect(chargeMatches(2500, 'KES', { amount: 250000, currency: 'KES' })).toBe(true)
    expect(chargeMatches(2500, 'KES', { amount: 250000 })).toBe(true)
    expect(chargeMatches(2500, 'KES', { amount: 249900, currency: 'KES' })).toBe(false)
    expect(chargeMatches(2500, 'KES', { amount: 250000, currency: 'USD' })).toBe(false)
  })
})

describe('date helpers', () => {
  it('dayFromDate is 1-based and floors invalid input to day 1', () => {
    expect(dayFromDate('2026-08-18', '2026-08-18')).toBe(1)
    expect(dayFromDate('2026-08-18', '2026-08-20')).toBe(3)
    expect(dayFromDate('2026-08-18', 'garbage')).toBe(1)
  })
  it('checkInMs anchors midday UTC and rejects malformed input', () => {
    expect(checkInMs('2026-08-18')).toBe(Date.parse('2026-08-18T12:00:00Z'))
    expect(checkInMs('18 Aug 2026')).toBeNull()
  })
  it('prettyDate localizes ISO dates and passes through the rest', () => {
    expect(prettyDate('2026-08-18')).toBe('18 Aug 2026')
    expect(prettyDate('tomorrow')).toBe('tomorrow')
  })
  it('stayNights counts at least one night', () => {
    expect(stayNights('2026-08-18', '2026-08-21')).toBe(3)
    expect(stayNights('2026-08-18', '2026-08-18')).toBe(1)
  })
  it('daysUntil is 0 for today', () => {
    const today = new Date()
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(daysUntil(iso)).toBe(0)
  })
})

describe('buildReminderEmail', () => {
  it('builds matching subject and CTA for both windows', () => {
    for (const which of ['r48', 'r24'] as const) {
      const { subject, html } = buildReminderEmail(
        { bookingId: 'b1', which, to: 'jane@example.com', label: 'Sarova Stanley', checkIn: '2026-08-20', type: 'Stay', reference: 'AB12', amount: 49500, tripId: 't1', tripName: 'Mara weekend' },
        'https://example.com',
      )
      expect(subject).toContain(which === 'r48' ? 'In 2 days' : 'Tomorrow')
      expect(html).toContain('https://example.com/trips/t1')
      expect(html).toContain('AB12')
    }
  })
})
