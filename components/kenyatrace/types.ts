export type Stop = {
  day: number
  time: string
  title: string
  place: string
  cost: number
  kind: string
  /** UI-only stable identity for drag/edit/map sync. Never persisted. */
  key?: string
  lat?: number
  lng?: number
  reason?: string
  locked?: boolean
  /** True when the stop is backed by a real listing in our database. */
  verified?: boolean
  /** 'catalog' = real listing; 'gap' = AI-drafted placeholder (price unverified). */
  source?: 'catalog' | 'gap'
  /** Id of the real listing this stop maps to (when verified). */
  listingId?: string
  /** The listing's vertical — used to link back to its Discover page. */
  vertical?: string
  /** The listing's pricing unit (e.g. "night", "person", "ride"). */
  unit?: string
  /** The listing's photo (when verified). */
  image?: string
  duration?: number
  howToGetThere?: string
  /** Road distance/time from the previous stop in the same day (when known). */
  travelKm?: number
  travelMins?: number
  /** True when the travel time came from real OSRM routing, false for an estimate. */
  travelRouted?: boolean
  /** Epoch ms when the traveller checked this stop off as done (undefined = not done). */
  completedAt?: number
}
