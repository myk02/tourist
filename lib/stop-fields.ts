import type { Doc } from '@/convex/_generated/dataModel'

/**
 * Full-fidelity mapper for `trips.replaceStops`. That mutation DELETES every
 * existing stop and reinserts exactly the rows it receives — so any caller
 * that maps only a subset of fields silently wipes the rest for the whole
 * trip: check-off progress (completedAt), the booking↔stop link (reason),
 * locks, verified flags, images and routed travel legs. Every caller of
 * replaceStops must go through this (the planner's toTripStops is its twin
 * for UI-shaped stops).
 */
export function toReplaceStopsPayload(stops: Doc<'tripStops'>[]) {
  return [...stops]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      name: s.name,
      place: s.place,
      day: s.day,
      time: s.time,
      cost: s.cost,
      kind: s.kind,
      order: i,
      lat: s.lat,
      lng: s.lng,
      locked: s.locked,
      reason: s.reason,
      verified: s.verified,
      duration: s.duration,
      source: s.source,
      listingId: s.listingId,
      vertical: s.vertical,
      unit: s.unit,
      image: s.image,
      travelKm: s.travelKm,
      travelMins: s.travelMins,
      travelRouted: s.travelRouted,
      completedAt: s.completedAt,
    }))
}
