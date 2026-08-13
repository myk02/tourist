/**
 * Geocoding helpers shared across pages — OpenStreetMap's free Nominatim
 * service, no API key required. Both functions are Kenya-scoped so results
 * stay relevant to trip planning.
 */

/** Reverse-geocodes exact coordinates into a human place label. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=13&accept-language=en`)
    if (!res.ok) return ''
    const data = await res.json()
    const a = data?.address
    const label = [a?.suburb, a?.neighbourhood, a?.town, a?.city, a?.county].filter(Boolean).join(', ')
    if (label) return label
    return data?.display_name ? String(data.display_name).split(',').slice(0, 2).join(', ') : ''
  } catch {
    return ''
  }
}

/**
 * Geocodes a typed area name into exact coordinates (restricted to Kenya).
 * Returns null when no match is found, so the typed text still works as-is.
 */
export async function geocodeArea(text: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ke&q=${encodeURIComponent(text)}`)
    if (!res.ok) return null
    const data = await res.json()
    const hit = Array.isArray(data) ? data[0] : null
    if (!hit || !hit.lat || !hit.lon) return null
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) }
  } catch {
    return null
  }
}
