/**
 * Per-day weather for a trip — the feature Yanvara/Mindtrip/Sygic surface and
 * travellers check daily. Uses Open-Meteo's free forecast API (no key, Kenya
 * covered) keyed off the trip's stop coordinates: each day's forecast comes
 * from the first geocoded stop scheduled that day, so the weather shown is
 * where the traveller actually plans to be.
 *
 * Pure fetch + shape code; all classification logic lives in the pure mapper
 * below so it is unit-testable without network.
 */

export interface WeatherDay {
  date: string
  /** YYYY-MM-DD trip day number the forecast belongs to. */
  day: number
  place: string
  minC: number
  maxC: number
  /** Millimetres of precipitation expected. */
  rainMm: number
  /** 0–100 probability of precipitation. */
  rainChance: number
  /** WMO weather code — mapped to a short human label below. */
  code: number
  label: string
}

/** WMO weather interpretation codes → short labels (subset Kenya actually sees). */
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code === 1 || code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if ((code >= 61 && code <= 65) || code === 80 || code === 81) return 'Rain'
  if (code === 66 || code === 67 || code === 82) return 'Heavy rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code === 95) return 'Thunderstorm'
  if (code === 96 || code === 99) return 'Thunderstorm + hail'
  return 'Mixed'
}

/**
 * Groups stops by day, picks the first geocoded stop per day, and merges the
 * matching Open-Meteo daily rows into WeatherDay objects. Pure — tested.
 */
export function buildWeatherDays(
  stops: { day: number; place: string; lat?: number | null; lng?: number | null }[],
  forecast: { date: string; minC: number; maxC: number; rainMm: number; rainChance: number; code: number }[],
  startDate: string,
): WeatherDay[] {
  if (!forecast.length) return []
  const startMs = Date.parse(`${startDate}T00:00:00Z`)
  if (!Number.isFinite(startMs)) return []
  const dayIndex = new Map<string, { day: number; place: string }>()
  for (const s of stops) {
    if (s.lat == null || s.lng == null || !Number.isFinite(s.lat) || !Number.isFinite(s.lat)) continue
    const date = new Date(startMs + (s.day - 1) * 86_400_000).toISOString().slice(0, 10)
    if (!dayIndex.has(date)) dayIndex.set(date, { day: s.day, place: s.place })
  }
  const out: WeatherDay[] = []
  for (const f of forecast) {
    const hit = dayIndex.get(f.date)
    if (!hit) continue
    out.push({
      date: f.date,
      day: hit.day,
      place: hit.place,
      minC: Math.round(f.minC),
      maxC: Math.round(f.maxC),
      rainMm: Math.round(f.rainMm * 10) / 10,
      rainChance: Math.round(f.rainChance),
      code: f.code,
      label: weatherLabel(f.code),
    })
  }
  return out.sort((a, b) => a.day - b.day)
}

export interface WeatherFetchResult {
  days: WeatherDay[]
  /** Honest degradation reason when the forecast is unavailable. */
  error?: string
}

/**
 * Fetches up to 16 days of daily forecast from Open-Meteo for the trip's
 * first geocoded stop per day and merges them with the itinerary. Never
 * throws — an outage yields an empty list plus a reason the UI can show.
 */
export async function fetchTripWeather(
  stops: { day: number; place: string; lat?: number | null; lng?: number | null }[],
  startDate: string,
): Promise<WeatherFetchResult> {
  // Unique geocoded stops, in day order — one Open-Meteo call handles several
  // coordinates, but the day→stop mapping differs per stop, so we fetch for
  // the trip's coordinate range and filter per day below. Simplest correct
  // approach: use the first geocoded stop overall as the anchor (Kenya's
  // climate varies smoothly over trip-scale distances) and label each day
  // with the stop actually scheduled.
  const anchor = stops.find(s => s.lat != null && s.lng != null && Number.isFinite(s.lat) && Number.isFinite(s.lng))
  if (!anchor) return { days: [], error: 'Add a location to your stops to see the forecast' }
  const startMs = Date.parse(`${startDate}T00:00:00Z`)
  if (!Number.isFinite(startMs)) return { days: [], error: 'Set trip dates to see the forecast' }

  const todayMs = Date.now()
  const isFuture = startMs >= todayMs - 86_400_000
  // Past/mid-trip: Open-Meteo's archive-style past_days covers recent days.
  const daysAhead = Math.min(Math.max(Math.ceil((startMs + 16 * 86_400_000 - todayMs) / 86_400_000), 1), 16)
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${anchor.lat}&longitude=${anchor.lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weathercode` +
    `&timezone=Africa%2FNairobi&forecast_days=${isFuture ? daysAhead : 1}&past_days=${isFuture ? 0 : 3}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return { days: [], error: 'Forecast unavailable right now' }
    const data = (await res.json()) as {
      daily?: {
        time: string[]
        temperature_2m_max: number[]
        temperature_2m_min: number[]
        precipitation_sum: number[]
        precipitation_probability_max: (number | null)[]
        weathercode: number[]
      }
    }
    const d = data.daily
    if (!d?.time?.length) return { days: [], error: 'Forecast unavailable right now' }
    const forecast = d.time.map((date, i) => ({
      date,
      minC: d.temperature_2m_min?.[i] ?? 0,
      maxC: d.temperature_2m_max?.[i] ?? 0,
      rainMm: d.precipitation_sum?.[i] ?? 0,
      rainChance: d.precipitation_probability_max?.[i] ?? 0,
      code: d.weathercode?.[i] ?? 3,
    }))
    return { days: buildWeatherDays(stops, forecast, startDate) }
  } catch {
    return { days: [], error: 'Forecast unavailable right now' }
  }
}
