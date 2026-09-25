import { describe, expect, it } from 'vitest'
import { buildWeatherDays, weatherLabel } from './weather'

describe('weatherLabel', () => {
  it('maps the codes Kenya actually sees to short labels', () => {
    expect(weatherLabel(0)).toBe('Clear')
    expect(weatherLabel(2)).toBe('Partly cloudy')
    expect(weatherLabel(61)).toBe('Rain')
    expect(weatherLabel(95)).toBe('Thunderstorm')
    expect(weatherLabel(9999)).toBe('Mixed')
  })
})

describe('buildWeatherDays', () => {
  const startDate = '2026-08-18'
  const stops = [
    { day: 1, place: 'Nairobi', lat: -1.29, lng: 36.82 },
    { day: 2, place: 'Naivasha', lat: -0.72, lng: 36.43 },
    { day: 2, place: 'Naivasha town', lat: -0.72, lng: 36.43 },
    { day: 3, place: 'Mara', lat: -1.4, lng: 35.13 },
    { day: 4, place: 'No coords stop' }, // never geocoded — skipped
  ]
  const forecast = [
    { date: '2026-08-18', minC: 11.4, maxC: 23.6, rainMm: 0, rainChance: 5, code: 0 },
    { date: '2026-08-19', minC: 10.9, maxC: 22.1, rainMm: 3.42, rainChance: 70, code: 61 },
    { date: '2026-08-20', minC: 12, maxC: 21, rainMm: 1, rainChance: 40, code: 95 },
    { date: '2026-09-01', minC: 12, maxC: 21, rainMm: 0, rainChance: 0, code: 1 },
  ]

  it('merges forecast rows with the first geocoded stop of each day', () => {
    const days = buildWeatherDays(stops, forecast, startDate)
    expect(days.map(d => d.day)).toEqual([1, 2, 3])
    expect(days[0].place).toBe('Nairobi')
    expect(days[1].place).toBe('Naivasha') // first stop of day 2, not the second
  })

  it('rounds temperatures, rain mm and probability honestly', () => {
    const days = buildWeatherDays(stops, forecast, startDate)
    expect(days[0]).toMatchObject({ minC: 11, maxC: 24, rainMm: 0, rainChance: 5, label: 'Clear' })
    expect(days[1]).toMatchObject({ rainMm: 3.4, rainChance: 70, label: 'Rain' })
    expect(days[2].label).toBe('Thunderstorm')
  })

  it('ignores forecast dates outside the trip window', () => {
    const days = buildWeatherDays(stops, forecast, startDate)
    expect(days.some(d => d.date === '2026-09-01')).toBe(false)
  })

  it('returns [] for trips without dates or with an empty forecast', () => {
    expect(buildWeatherDays(stops, forecast, 'not-a-date')).toEqual([])
    expect(buildWeatherDays(stops, [], startDate)).toEqual([])
  })

  it('skips stops without coordinates when anchoring days', () => {
    const days = buildWeatherDays(stops, forecast, startDate)
    expect(days.some(d => d.place === 'No coords stop')).toBe(false)
  })
})
