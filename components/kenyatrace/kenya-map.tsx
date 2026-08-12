'use client'

import { useEffect, useRef } from 'react'
import type { Listing } from '@/lib/kenya-data'

type Point = Pick<Listing, 'name' | 'location' | 'lat' | 'lng'> & { id: string }
export function toPoint(l: Listing): Point { return { id: l._id, name: l.name, location: l.location, lat: l.lat, lng: l.lng } }

export function KenyaMap({ points = [], route = [], paths = [], className = 'h-[640px]', hoveredId, onMarkerEnter, onMarkerLeave, onMarkerSelect }: {
  points?: Point[]
  route?: [number, number][]
  paths?: [number, number][][]
  className?: string
  hoveredId?: string | null
  onMarkerEnter?: (id: string) => void
  onMarkerLeave?: () => void
  onMarkerSelect?: (id: string) => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const markerEls = useRef(new Map<string, HTMLButtonElement>())
  const hoveredRef = useRef<string | null>(null)
  hoveredRef.current = hoveredId ?? null

  const applyHover = () => {
    markerEls.current.forEach((el, id) => {
      const active = id === hoveredRef.current
      el.classList.toggle('kenya-map-marker-active', active)
      el.style.zIndex = active ? '2' : '1'
      el.style.transform = active ? 'scale(1.35)' : ''
    })
  }

  useEffect(() => { applyHover() }, [hoveredId])

  useEffect(() => {
    if (!node.current) return
    let disposed = false
    let map: import('maplibre-gl').Map | undefined
    const markers: import('maplibre-gl').Marker[] = []
    markerEls.current.clear()

    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (disposed || !node.current) return
      map = new maplibregl.Map({
        container: node.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [37.4, -0.6],
        zoom: 5.4,
        attributionControl: false,
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

      points.forEach(point => {
        const element = document.createElement('button')
        element.className = 'kenya-map-marker'
        element.setAttribute('aria-label', `View ${point.name}`)
        element.addEventListener('mouseenter', () => onMarkerEnter?.(point.id))
        element.addEventListener('mouseleave', () => onMarkerLeave?.())
        element.addEventListener('click', () => onMarkerSelect?.(point.id))
        markerEls.current.set(point.id, element)
        const popup = new maplibregl.Popup({ offset: 20 }).setHTML(`<strong>${point.name}</strong><br/><span>${point.location}</span>`)
        markers.push(new maplibregl.Marker({ element }).setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map!))
      })
      applyHover()

      map.on('load', () => {
        if (!map) return
        const allPaths: { coordinates: [number, number][]; color: string; dashed: boolean }[] = []
        if (route.length >= 2) allPaths.push({ coordinates: route, color: '#0b6e4f', dashed: false })
        paths.forEach(p => { if (p.length >= 2) allPaths.push({ coordinates: p, color: '#f59e0b', dashed: true }) })
        if (allPaths.length === 0) return
        const bounds = new maplibregl.LngLatBounds()
        allPaths.forEach((path, index) => {
          map!.addSource(`route-${index}`, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.coordinates } } })
          map!.addLayer({
            id: `route-${index}`,
            type: 'line',
            source: `route-${index}`,
            paint: { 'line-color': path.color, 'line-width': 5, 'line-opacity': 0.85, ...(path.dashed ? { 'line-dasharray': [1.5, 2] } : {}) },
          })
          path.coordinates.forEach(coordinate => bounds.extend(coordinate))
        })
        map.fitBounds(bounds, { padding: 80, maxZoom: 10 })
      })
    })

    return () => {
      disposed = true
      markers.forEach(marker => marker.remove())
      map?.remove()
    }
  }, [points, route, paths])

  return <div ref={node} className={`overflow-hidden rounded-lg border bg-secondary ${className}`} aria-label="Interactive map of Kenya" />
}
