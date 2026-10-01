'use client'

import { useEffect, useState } from 'react'
import { CloudRain, CloudSun, Cloud, CloudLightning, Sun, CloudFog, Thermometer } from 'lucide-react'
import type { WeatherDay } from '@/lib/weather'

/** Picks a lucide icon for a WMO weather code. */
function iconFor(code: number) {
  if (code === 0) return Sun
  if (code === 1 || code === 2) return CloudSun
  if (code === 3 || code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 67) return CloudRain
  if (code === 95 || code === 96 || code === 99) return CloudLightning
  return Cloud
}

/**
 * The per-day forecast strip (Yanvara/Sygic-style): one compact card per
 * itinerary day showing where the traveller plans to be and what the sky is
 * expected to do. Fetch runs client-side so the trip page stays static-ish;
 * failures degrade to a one-line note, never an error state.
 */
export function WeatherStrip({ stops, startDate }: {
  stops: { day: number; place: string; lat?: number | null; lng?: number | null }[]
  startDate?: string
}) {
  const [days, setDays] = useState<WeatherDay[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!startDate || stops.length === 0) return
    let cancelled = false
    setLoading(true)
    setNote(null)
    import('@/lib/weather')
      .then(({ fetchTripWeather }) => fetchTripWeather(stops, startDate))
      .then(result => {
        if (cancelled) return
        setDays(result.days)
        setNote(result.days.length === 0 ? result.error ?? null : null)
      })
      .catch(() => { if (!cancelled) setNote('Forecast unavailable right now') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // JSON-stringified deps: the stops array identity changes on every parent render.
  }, [startDate, JSON.stringify(stops.map(s => [s.day, s.place, s.lat, s.lng]))])

  if (loading && days.length === 0) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Loading weather forecast">
        {[0, 1, 2, 3].map(i => <div key={i} className="kt-shimmer h-24 w-32 shrink-0 rounded-none" />)}
      </div>
    )
  }

  if (days.length === 0) {
    if (!note) return null
    return <p className="text-xs text-muted-foreground">{note}</p>
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Weather forecast by day">
      {days.map(d => {
        const Icon = iconFor(d.code)
        const rainy = d.rainChance >= 50
        return (
          <div
            key={d.day}
            role="listitem"
            className={`flex w-36 shrink-0 flex-col gap-1 rounded-none border p-3 ${rainy ? 'border-sky-500/30 bg-sky-500/5' : 'bg-card'}`}
          >
            <p className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              Day {d.day}
              <Icon className={`size-4 ${rainy ? 'text-sky-600 dark:text-sky-400' : 'text-amber-500'}`} />
            </p>
            <p className="truncate text-xs text-muted-foreground" title={d.place}>{d.place}</p>
            <p className="font-serif text-lg font-semibold">{d.maxC}° <span className="text-sm font-normal text-muted-foreground">/ {d.minC}°</span></p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Thermometer className="size-3" />
              {d.label}{d.rainChance >= 30 ? ` · ${d.rainChance}% rain` : ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}
