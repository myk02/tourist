'use client'

import { useEffect, useRef } from 'react'
import type { Listing } from '@/lib/kenya-data'

type Point = Pick<Listing, 'id' | 'name' | 'location' | 'lat' | 'lng'>

export function KenyaMap({ points = [], route = [], className = 'h-[640px]' }: { points?: Point[]; route?: [number, number][]; className?: string }) {
  const node = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!node.current) return
    let disposed = false
    let map: import('maplibre-gl').Map | undefined
    const markers: import('maplibre-gl').Marker[] = []

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
        const popup = new maplibregl.Popup({ offset: 20 }).setHTML(`<strong>${point.name}</strong><br/><span>${point.location}</span>`)
        markers.push(new maplibregl.Marker({ element }).setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map!))
      })

      map.on('load', () => {
        if (!map || route.length < 2) return
        map.addSource('trip-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } } })
        map.addLayer({ id: 'trip-route', type: 'line', source: 'trip-route', paint: { 'line-color': '#0b6e4f', 'line-width': 5, 'line-opacity': 0.85 } })
        const bounds = new maplibregl.LngLatBounds()
        route.forEach(coordinate => bounds.extend(coordinate))
        map.fitBounds(bounds, { padding: 80, maxZoom: 10 })
      })
    })

    return () => {
      disposed = true
      markers.forEach(marker => marker.remove())
      map?.remove()
    }
  }, [points, route])

  return <div ref={node} className={`overflow-hidden rounded-2xl border bg-secondary ${className}`} aria-label="Interactive map of Kenya" />
}
