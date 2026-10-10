'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from '@/components/theme-provider'
import type { Listing } from '@/lib/kenya-data'

type Point = Pick<Listing, 'name' | 'location' | 'lat' | 'lng'> & { id: string; price?: number; rating?: number }
export function toPoint(l: Listing): Point { return { id: l._id, name: l.name, location: l.location, lat: l.lat, lng: l.lng, price: l.price, rating: l.rating } }

/** Compact price for map pins: KSh 4.5k / KSh 120k / KSh 1.2M */
function compactKES(value: number) {
  if (value >= 1_000_000) return `KSh ${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 1000) return `KSh ${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `KSh ${value}`
}

/**
 * Turns a sparse set of waypoints into a smooth, curving line (Catmull-Rom
 * spline sampled densely). Straight hops between stops look broken; a smooth
 * curve reads as an intentional route on the map.
 */
function smoothRoute(coords: [number, number][], samplesPerSeg = 24): [number, number][] {
  if (coords.length < 3) return coords
  const pts = coords.map(([lng, lat]) => ({ lng, lat }))
  const out: [number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let t = 0; t < samplesPerSeg; t++) {
      const u = t / samplesPerSeg
      const u2 = u * u
      const u3 = u2 * u
      const lng = 0.5 * (2 * p1.lng + (-p0.lng + p2.lng) * u + (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * u2 + (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * u3)
      const lat = 0.5 * (2 * p1.lat + (-p0.lat + p2.lat) * u + (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * u2 + (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * u3)
      out.push([lng, lat])
    }
  }
  out.push([pts[pts.length - 1].lng, pts[pts.length - 1].lat])
  return out
}

export function KenyaMap({ points = [], route = [], live, livePath, followLive = false, className = 'h-[640px]', hoveredId, highlight = [], destIds = [], focus, labelMode = false, onMarkerEnter, onMarkerLeave, onMarkerSelect }: {
  points?: Point[]
  route?: [number, number][]
  /** The traveller's current position — a persistent marker moved in place, never a map rebuild. */
  live?: { lat: number; lng: number; accuracy?: number } | null
  /** The growing live trace — redrawn into a persistent dashed line, never a map rebuild. */
  livePath?: [number, number][]
  /** While tracking: keep the camera centred on the live position. */
  followLive?: boolean
  className?: string
  hoveredId?: string | null
  /** Point ids that get a distinct pulsing "user location" marker style. */
  highlight?: string[]
  /** Point ids that get a flag-pin "destination" marker style. */
  destIds?: string[]
  /** When set (and no route is drawn), fly the camera to this exact spot. */
  focus?: { lat: number; lng: number; zoom?: number }
  /** Render points as price + rating chips instead of plain dots (mobile map). */
  labelMode?: boolean
  onMarkerEnter?: (id: string) => void
  onMarkerLeave?: () => void
  onMarkerSelect?: (id: string) => void
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const node = useRef<HTMLDivElement>(null)
  const markerEls = useRef(new Map<string, HTMLButtonElement>())
  const hoveredRef = useRef<string | null>(null)
  hoveredRef.current = hoveredId ?? null

  // Latest live values, read at map-creation time (the map inits asynchronously
  // after the dynamic import) and kept out of the rebuild deps so a live GPS
  // tick moves the marker instead of tearing the map down.
  const liveCoordsRef = useRef<{ lat: number; lng: number } | null>(null)
  liveCoordsRef.current = live ?? null
  const liveTraceRef = useRef<[number, number][]>([])
  liveTraceRef.current = livePath ?? []
  const routeRef = useRef<[number, number][]>([])
  routeRef.current = route ?? []
  const followLiveRef = useRef(false)
  followLiveRef.current = followLive
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const liveMarkerRef = useRef<import('maplibre-gl').Marker | null>(null)
  const livePopupRef = useRef<import('maplibre-gl').Popup | null>(null)
  const livePathSourceRef = useRef<{ setData: (data: unknown) => void } | null>(null)

  const applyHover = () => {
    markerEls.current.forEach((el, id) => {
      const active = id === hoveredRef.current
      el.classList.toggle('kenya-map-marker-active', active)
      el.style.zIndex = active ? '2' : '1'
      const isChip = el.classList.contains('kenya-map-marker-price')
      el.style.transform = active ? (isChip ? 'scale(1.12)' : 'scale(1.35)') : ''
    })
  }

  // Escape listing text before injecting into a MapLibre popup (setHTML).
  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  useEffect(() => { applyHover() }, [hoveredId])

  // Theme is not a rebuild trigger — map survives theme toggles via setStyle.
  const isDarkRef = useRef(isDark)
  isDarkRef.current = isDark

  useEffect(() => {
    if (!node.current) return
    let disposed = false
    let map: import('maplibre-gl').Map | undefined
    const markers: import('maplibre-gl').Marker[] = []
    markerEls.current.clear()
    mapRef.current = null
    liveMarkerRef.current = null
    livePopupRef.current = null
    livePathSourceRef.current = null

    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (disposed || !node.current) return
      // Follow the app theme: dark basemap at night, light during the day.
      // Use the ref so this creation effect doesn't re-run on theme toggle.
      const style = isDarkRef.current ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/liberty'
      map = new maplibregl.Map({
        container: node.current,
        style,
        center: [37.4, -0.6],
        zoom: 5.4,
        attributionControl: false,
      })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

      points.forEach(point => {
        const element = document.createElement('button')
        if (labelMode) {
          element.className = 'kenya-map-marker kenya-map-marker-price'
          const price = document.createElement('span')
          price.textContent = compactKES(point.price ?? 0)
          element.appendChild(price)
          if (point.rating && point.rating > 0) {
            const rating = document.createElement('span')
            rating.className = 'kenya-map-marker-rating'
            rating.textContent = `★ ${point.rating.toFixed(1)}`
            element.appendChild(rating)
          }
        } else {
          element.className = destIds.includes(point.id)
            ? 'kenya-map-marker kenya-map-marker-dest'
            : highlight.includes(point.id)
              ? 'kenya-map-marker kenya-map-marker-user'
              : 'kenya-map-marker'
        }
        element.setAttribute('aria-label', `View ${point.name}`)
        element.addEventListener('mouseenter', () => onMarkerEnter?.(point.id))
        element.addEventListener('mouseleave', () => onMarkerLeave?.())
        element.addEventListener('click', () => onMarkerSelect?.(point.id))
        markerEls.current.set(point.id, element)
        const popup = new maplibregl.Popup({ offset: 20 }).setHTML(`<strong>${escapeHtml(point.name)}</strong><br/><span>${escapeHtml(point.location)}</span>`)
        markers.push(new maplibregl.Marker({ element }).setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map!))
      })
      applyHover()

      // Persistent live-position marker: created once, moved via setLngLat.
      const liveElement = document.createElement('button')
      liveElement.className = 'kenya-map-marker kenya-map-marker-user kenya-map-marker-live'
      liveElement.setAttribute('aria-label', 'Your live location')
      liveElement.style.zIndex = '3'
      const liveStart = liveCoordsRef.current
      const livePopup = new maplibregl.Popup({ offset: 20, closeButton: false })
      livePopupRef.current = livePopup
      // addTo() requires a position (maplibre v5 reads _lngLat.lng internally),
      // so always set one — [0,0] is fine because the marker is hidden until
      // the first live fix arrives via the update effect below.
      const liveMarker = new maplibregl.Marker({ element: liveElement }).setPopup(livePopup)
      liveMarker.setLngLat(liveStart ? [liveStart.lng, liveStart.lat] : [0, 0])
      if (!liveStart) liveElement.style.display = 'none'
      liveMarker.addTo(map!)
      liveMarkerRef.current = liveMarker
      markers.push(liveMarker)

      map.on('load', () => {
        if (!map) return
        // Persistent live-trace line: source created once, redrawn via setData.
        map.addSource('live-path', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: liveTraceRef.current } } })
        map.addLayer({ id: 'live-path', type: 'line', source: 'live-path', paint: { 'line-color': isDarkRef.current ? '#fbbf24' : '#f59e0b', 'line-width': 4, 'line-opacity': 0.85, 'line-dasharray': [1.5, 2] } })
        livePathSourceRef.current = map.getSource('live-path') as unknown as { setData: (data: unknown) => void }

        const trace = liveTraceRef.current

        if (route.length >= 2) {
          // The main origin→destination route: a soft casing underneath a
          // smooth primary-green line, so it reads like a real drawn route
          // against both the light and dark basemaps.
          const smooth = smoothRoute(route)
          const casingColor = isDarkRef.current ? '#0a100d' : '#ffffff'
          const routeColor = isDarkRef.current ? '#35c992' : '#0e7a55'
          map.addSource('route-main', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: smooth } } })
          map.addLayer({ id: 'route-casing', type: 'line', source: 'route-main', paint: { 'line-color': casingColor, 'line-width': 9, 'line-opacity': isDarkRef.current ? 0.85 : 0.9 } })
          map.addLayer({ id: 'route-main', type: 'line', source: 'route-main', paint: { 'line-color': routeColor, 'line-width': 4.5, 'line-opacity': 0.9 } })
          const bounds = new maplibregl.LngLatBounds()
          smooth.forEach(coord => bounds.extend(coord))
          trace.forEach(coord => bounds.extend(coord))
          map.fitBounds(bounds, { padding: 80, maxZoom: 10 })
        } else if (trace.length >= 2) {
          const bounds = new maplibregl.LngLatBounds()
          trace.forEach(coord => bounds.extend(coord))
          map.fitBounds(bounds, { padding: 80, maxZoom: 10 })
        } else {
          // No route to draw — zoom right in on the pinned spot instead.
          if (focus) {
            map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 10, duration: 1500, essential: true })
          }
        }
      })
    }).catch(() => {
      // MapLibre chunk failed to load (offline) — leave empty state.
    })

    return () => {
      disposed = true
      markers.forEach(marker => marker.remove())
      // Stop any in-flight camera animation before tearing the map down —
      // removing a map mid-flyTo leaves maplibre's transform in a null state.
      try { map?.stop() } catch { /* ignore */ }
      map?.remove()
      mapRef.current = null
      liveMarkerRef.current = null
      livePopupRef.current = null
      livePathSourceRef.current = null
    }
  }, [points, route, highlight, destIds, focus, labelMode])

  // Theme toggle without tearing the map down — swap basemap style in place,
  // then re-add our route + live-trace layers (setStyle removes all custom
  // sources/layers in MapLibre).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = isDark ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/liberty'
    try {
      // Avoid redundant setStyle if already that theme.
      const current = (map.getStyle() as unknown as { name?: string })?.name ?? ''
      if ((isDark && current.includes('dark')) || (!isDark && current.includes('liberty'))) return
    } catch { /* ignore */ }
    try {
      const routeCoords = smoothRoute((routeRef.current ?? []) as [number, number][])
      const liveCoords = [...(liveTraceRef.current ?? [])]
      const dark = isDark
      const reAdd = () => {
        try {
          if (!map.getSource('live-path')) {
            map.addSource('live-path', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: liveCoords } } })
            map.addLayer({ id: 'live-path', type: 'line', source: 'live-path', paint: { 'line-color': dark ? '#fbbf24' : '#f59e0b', 'line-width': 4, 'line-opacity': 0.85, 'line-dasharray': [1.5, 2] } })
            livePathSourceRef.current = map.getSource('live-path') as unknown as { setData: (data: unknown) => void }
          }
          if (routeCoords.length >= 2 && !map.getSource('route-main')) {
            const casingColor = dark ? '#0a100d' : '#ffffff'
            const routeColor = dark ? '#35c992' : '#0e7a55'
            map.addSource('route-main', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoords } } })
            map.addLayer({ id: 'route-casing', type: 'line', source: 'route-main', paint: { 'line-color': casingColor, 'line-width': 9, 'line-opacity': dark ? 0.85 : 0.9 } })
            map.addLayer({ id: 'route-main', type: 'line', source: 'route-main', paint: { 'line-color': routeColor, 'line-width': 4.5, 'line-opacity': 0.9 } })
          }
        } catch { /* ignore — map torn down mid-toggle */ }
      }
      // styledata fires when the new basemap is ready for custom layers.
      map.once('styledata', reAdd)
      map.setStyle(style)
    } catch { /* ignore */ }
  }, [isDark])

  // Move the live marker (and follow the camera) — in place, no map rebuild.
  useEffect(() => {
    const marker = liveMarkerRef.current
    if (!marker) return
    if (live) {
      marker.setLngLat([live.lng, live.lat])
      marker.getElement().style.display = ''
      livePopupRef.current?.setText(live.accuracy != null ? `You are here · ±${Math.round(live.accuracy)} m` : 'You are here')
      // Follow only when the traveller drifts near the viewport edge — never
      // fight the user's pan/zoom, and keep their zoom level.
      if (followLiveRef.current) {
        const map = mapRef.current
        if (map) {
          const bounds = map.getBounds()
          const pad = 0.25
          const marginX = (bounds.getEast() - bounds.getWest()) * pad
          const marginY = (bounds.getNorth() - bounds.getSouth()) * pad
          const nearEdge = live.lng < bounds.getWest() + marginX || live.lng > bounds.getEast() - marginX
            || live.lat < bounds.getSouth() + marginY || live.lat > bounds.getNorth() - marginY
          if (nearEdge) map.flyTo({ center: [live.lng, live.lat], zoom: map.getZoom(), duration: 1200, essential: true })
        }
      }
    } else {
      marker.getElement().style.display = 'none'
    }
  }, [live])

  // Redraw the live trace into the persistent source — no map rebuild.
  useEffect(() => {
    try {
      livePathSourceRef.current?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: (livePath ?? []).filter(p => p.length === 2) },
      })
    } catch { /* ignore — source removed during theme swap, re-added on styledata */ }
  }, [livePath])

  return <div ref={node} className={`overflow-hidden rounded-none border border-border bg-card ${className}`} aria-label="Interactive map of Kenya" />
}
