/**
 * Geocoding helpers shared across pages — OpenStreetMap's free Nominatim
 * service, no API key required. Both functions are Kenya-scoped so results
 * stay relevant to trip planning.
 */

const GEO_TIMEOUT = 8000
const GEO_HEADERS = { 'User-Agent': 'KenyaTrace/1.0 (contact: support@kenyatrace.vercel.app)', 'Accept-Language': 'en' }

/** Reverse-geocodes exact coordinates into a human place label. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return ''
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=13&accept-language=en`, {
      headers: GEO_HEADERS,
      signal: AbortSignal.timeout(GEO_TIMEOUT),
    })
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
 * Geocodes a typed area name into coordinates. Kenya is the default scope;
 * international trip origins can omit it and provide a city plus country.
 * Returns null when no match is found, so the typed text still works as-is.
 */
export async function geocodeArea(text: string, options: { countryCode?: string } = { countryCode: 'ke' }): Promise<{ lat: number; lng: number } | null> {
  const q = text?.trim().slice(0, 200)
  if (!q) return null
  try {
    const country = options.countryCode ? `&countrycodes=${encodeURIComponent(options.countryCode)}` : ''
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1${country}&q=${encodeURIComponent(q)}`, {
      headers: GEO_HEADERS,
      signal: AbortSignal.timeout(GEO_TIMEOUT),
    })
    if (!res.ok) return null
    const data = await res.json()
    const hit = Array.isArray(data) ? data[0] : null
    if (!hit || !hit.lat || !hit.lon) return null
    const lat = parseFloat(hit.lat)
    const lng = parseFloat(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}
