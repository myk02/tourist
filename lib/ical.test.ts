import { describe, expect, it } from 'vitest'
import { buildIcsFeed, icsEscape, icsFold } from './ical'

describe('icsEscape', () => {
  it('escapes backslashes first, then semicolons, commas and newlines', () => {
    expect(icsEscape('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })

  it('leaves plain text untouched', () => {
    expect(icsEscape('Maasai Mara game drive')).toBe('Maasai Mara game drive')
  })
})

describe('icsFold', () => {
  it('keeps short lines on one physical line', () => {
    expect(icsFold('SUMMARY:Short')).toEqual(['SUMMARY:Short'])
  })

  it('folds long lines with a leading space on continuations', () => {
    const long = `SUMMARY:${'x'.repeat(200)}`
    const folded = icsFold(long)
    expect(folded.length).toBeGreaterThan(1)
    for (const line of folded) expect(line.length).toBeLessThanOrEqual(75)
    // Refolding semantics: joining continuation lines by removing "\r\n " restores the original.
    expect(folded.join('\r\n').replace(/\r\n /g, '')).toBe(long)
  })
})

describe('buildIcsFeed', () => {
  const feed = buildIcsFeed({
    tripName: 'Mara weekend; part 1',
    events: [
      {
        uid: 'stop_abc123',
        start: '2026-08-18T09:00',
        summary: 'Game drive, Maasai Mara',
        description: 'Cost: KES 6,200\nDay 3',
        location: 'Narok, Kenya',
      },
      {
        uid: 'stay_def456',
        start: '2026-08-19',
        end: '2026-08-21',
        summary: 'Hotel stay',
      },
    ],
  })

  it('wraps the calendar in VCALENDAR with a KenyaTrace PRODID', () => {
    expect(feed.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//KenyaTrace//Trip Calendar//EN')).toBe(true)
    expect(feed.endsWith('END:VCALENDAR')).toBe(true)
  })

  it('emits timed events with floating local DTSTART/DTEND', () => {
    expect(feed).toContain('DTSTART:20260818T090000\r\n')
    expect(feed).toContain('DTEND:20260818T100000\r\n')
  })

  it('emits all-day events with VALUE=DATE', () => {
    expect(feed).toContain('DTSTART;VALUE=DATE:20260819\r\n')
    expect(feed).toContain('DTEND;VALUE=DATE:20260821\r\n')
  })

  it('escapes commas and semicolons in property values and newlines in descriptions', () => {
    expect(feed).toContain('X-WR-CALNAME:Mara weekend\\; part 1\r\n')
    expect(feed).toContain('SUMMARY:Game drive\\, Maasai Mara\r\n')
    expect(feed).toContain('DESCRIPTION:Cost: KES 6\\,200\\nDay 3\r\n')
  })

  it('uses the event uid verbatim so calendar resubscribes update instead of duplicating', () => {
    expect(feed).toContain('UID:stop_abc123\r\n')
    expect(feed).toContain('UID:stay_def456\r\n')
  })

  it('defaults a missing end to one hour after the start', () => {
    const minimal = buildIcsFeed({ tripName: 't', events: [{ uid: 'u', start: '2026-08-18T09:00', summary: 'x' }] })
    expect(minimal).toContain('DTEND:20260818T100000')
  })

  it('rolls a 23:xx start over to the next day instead of a zero-length event', () => {
    const late = buildIcsFeed({ tripName: 't', events: [{ uid: 'u', start: '2026-08-18T23:00', summary: 'x' }] })
    expect(late).toContain('DTEND:20260819T000000')
  })
})
