/** A planner item built only from the authoritative Convex listings table. */
export interface PlannerCandidate {
  id: string
  vertical: string
  name: string
  location: string
  price: number
  unit: string
  rating: number
  reviews: number
  tags: string[]
  description: string
  lat: number
  lng: number
  image: string
}

/** The subset of a Convex listing needed by the planner. */
export type CatalogListing = Omit<PlannerCandidate, 'id'> & { _id: string }

/**
 * Resolve the browser's requested IDs against the trusted catalog. Request
 * fields other than IDs are deliberately ignored, so a caller cannot mark a
 * made-up place or price as verified by editing the POST body.
 */
export function resolvePlannerCandidates(ids: readonly string[], listings: readonly CatalogListing[]): PlannerCandidate[] {
  const byId = new Map(listings.map(listing => [listing._id, listing]))
  const seen = new Set<string>()
  const resolved: PlannerCandidate[] = []

  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const listing = byId.get(id)
    if (!listing) continue
    const { _id, ...candidate } = listing
    resolved.push({ id: _id, ...candidate })
  }

  return resolved
}
