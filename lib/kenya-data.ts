export type Vertical = "stays" | "flights" | "attractions" | "cars" | "taxis"

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
  { id: "attractions", label: "Things to do" },
  { id: "cars", label: "Cars" },
  { id: "taxis", label: "Taxis" },
]

// Canonical KES formatter. The currency symbol prefix is pinned (en-KE's ICU
// renders "Ksh" with locale-dependent spacing, which drifts between runtimes);
// only the numeric portion uses the locale so grouping stays correct.
export function formatKES(value: number) {
  return `KSh ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(value)}`
}

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
