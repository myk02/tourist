export type Vertical = "stays" | "flights" | "things-to-do" | "attractions" | "cars" | "taxis"

export type Listing = {
  _id: string
  vertical: string
  name: string
  location: string
  price: number
  unit: string
  rating: number
  reviews: number
  image: string
  tags: string[]
  description: string
  lat: number
  lng: number
  source?: string
}

export const categories: { id: Vertical; label: string }[] = [
  { id: "stays", label: "Stays" },
  { id: "flights", label: "Flights" },
  { id: "things-to-do", label: "Things to do" },
  { id: "attractions", label: "Attractions" },
  { id: "cars", label: "Cars" },
  { id: "taxis", label: "Taxis" },
]

export const itinerary = [
  { day: 1, time: "09:00", title: "Arrive & settle into Nairobi", place: "Westlands, Nairobi", cost: 14200, kind: "Stay" },
  { day: 2, time: "07:00", title: "Drive to the Maasai Mara", place: "Narok County", cost: 12500, kind: "Transport" },
  { day: 2, time: "15:30", title: "Golden-hour game drive", place: "Mara Triangle", cost: 6200, kind: "Experience" },
  { day: 3, time: "06:00", title: "Sunrise over the savannah", place: "Mara River", cost: 4800, kind: "Experience" },
]

export function formatKES(value: number) { return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value) }

/**
 * Normalizes any upload.wikimedia.org URL to a valid thumbnail URL.
 * Wikimedia only serves specific width buckets (e.g. 960px) — requesting
 * arbitrary widths like 800px returns 400, and full-size originals are
 * multi-megabyte downloads. This rewrites both cases to a fast 960px thumb.
 */
export function wikimediaThumb(url: string, width = 960): string {
  if (!url || !url.startsWith("https://upload.wikimedia.org/")) return url
  const clean = url.split("?")[0]
  // Already a thumb: .../commons/thumb/{a}/{ab}/{file}/{w}px-{file}
  const thumb = clean.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/(.+?)\/(\d+)px-(.+)$/)
  if (thumb) return `https://upload.wikimedia.org/wikipedia/commons/thumb/${thumb[1]}/${width}px-${thumb[3]}`
  // Full-size original: .../commons/{a}/{ab}/{file}
  const orig = clean.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([^/]+\/[^/]+\/[^/]+)$/)
  if (orig) {
    const file = orig[1].split("/").pop() ?? ""
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${orig[1]}/${width}px-${file}`
  }
  return url
}

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000
export const totalCost = itinerary.reduce((sum, stop) => sum + stop.cost, 0)
