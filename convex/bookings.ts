import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { requireActiveAccess } from "./subscriptions"

function kindFromVertical(vertical: string): string {
  if (vertical === "stays") return "Stay"
  if (vertical === "flights" || vertical === "taxis" || vertical === "cars") return "Transport"
  return "Experience"
}

/** Day number (1-based) for a check-in date relative to the trip start date. */
function dayFromDate(startDate: string, checkIn: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime()
  const check = new Date(`${checkIn}T00:00:00`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(check)) return 1
  return Math.max(Math.round((check - start) / 86400000) + 1, 1)
}

/** How long a pending checkout may block cancellation before it counts as abandoned. */
const PENDING_PAYMENT_GRACE_MS = 60 * 60 * 1000

export const mine = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  return ctx.db.query("bookings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).order("desc").collect()
}})

export const forTrip = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) return []
  return ctx.db.query("bookings").withIndex("by_trip", q => q.eq("tripId", tripId)).order("desc").collect()
}})

export const create = mutation({ args: { listingId: v.string(), type: v.string(), amount: v.number(), tripId: v.optional(v.id("trips")), checkIn: v.optional(v.string()), checkOut: v.optional(v.string()), guests: v.optional(v.number()) }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  await requireActiveAccess(ctx.db, identity.subject)
  if (args.amount < 0) throw new Error("Invalid reservation amount")
  const reference = `KT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

  // When the reservation is linked to a trip, mirror it as a trip stop so it
  // shows on the itinerary and route map.
  let stopId: Id<"tripStops"> | undefined
  if (args.tripId) {
    const trip = await ctx.db.get(args.tripId)
    if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
    const listing = await ctx.db.get(args.listingId as Id<"listings">)
    const existing = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", args.tripId!)).collect()
    const day = args.checkIn ? dayFromDate(trip.startDate, args.checkIn) : (existing.length ? Math.max(...existing.map(s => s.day)) : 1)
    // duration is stored in minutes; a stay is 24h per night booked.
    const kind = listing ? kindFromVertical(listing.vertical) : "Experience"
    const duration = kind === "Stay" && args.checkIn && args.checkOut
      ? Math.max(Math.round((new Date(`${args.checkOut}T00:00:00`).getTime() - new Date(`${args.checkIn}T00:00:00`).getTime()) / 86400000), 1) * 1440
      : undefined
    stopId = await ctx.db.insert("tripStops", {
      tripId: args.tripId,
      name: listing?.name ?? "Reserved place",
      place: listing?.location ?? "Kenya",
      day,
      time: "09:00",
      cost: args.amount,
      kind,
      order: existing.length,
      lat: listing?.lat,
      lng: listing?.lng,
      duration,
      reason: `Reservation ${reference}`,
    })
    await ctx.db.patch(args.tripId, { totalCost: trip.totalCost + args.amount })
    // A trip with a real reservation on the books is no longer just planning.
    if (trip.status === "planning") await ctx.db.patch(args.tripId, { status: "booked" })
  }

  await ctx.db.insert("bookings", { ...args, ownerId: identity.subject, status: "requested", paymentMethod: "not-collected", reference, stopId })
  return reference
}})

/**
 * Booking created from a forwarded confirmation email (TripIt-style). Unlike
 * `create`, there is no marketplace listing behind it, so name/place come
 * straight from the parsed email and `listingId` stays empty.
 */
export const createFromEmail = mutation({
  args: {
    tripId: v.optional(v.id("trips")),
    name: v.string(),
    place: v.optional(v.string()),
    type: v.string(),
    amount: v.number(),
    reference: v.optional(v.string()),
    checkIn: v.optional(v.string()),
    checkOut: v.optional(v.string()),
    guests: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    await requireActiveAccess(ctx.db, identity.subject)
    if (args.amount < 0) throw new Error("Invalid reservation amount")
    const reference = args.reference || `KT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const kind = args.type === "Stay" ? "Stay" : args.type === "Flight" || args.type === "Transport" ? "Transport" : "Experience"

    // Mirror the reservation as a trip stop (like `create`) so it shows on
    // the itinerary and route map, keyed by reference so `cancel` can undo it.
    let stopId: Id<"tripStops"> | undefined
    if (args.tripId) {
      const trip = await ctx.db.get(args.tripId)
      if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
      const existing = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", args.tripId!)).collect()
      const day = args.checkIn ? dayFromDate(trip.startDate, args.checkIn) : (existing.length ? Math.max(...existing.map(s => s.day)) : 1)
      const duration = kind === "Stay" && args.checkIn && args.checkOut
        ? Math.max(Math.round((new Date(`${args.checkOut}T00:00:00`).getTime() - new Date(`${args.checkIn}T00:00:00`).getTime()) / 86400000), 1) * 1440
        : undefined
      stopId = await ctx.db.insert("tripStops", {
        tripId: args.tripId,
        name: args.name,
        place: args.place ?? "Kenya",
        day,
        time: "09:00",
        cost: args.amount,
        kind,
        order: existing.length,
        duration,
        reason: `Reservation ${reference}`,
      })
      await ctx.db.patch(args.tripId, { totalCost: trip.totalCost + args.amount })
      if (trip.status === "planning") await ctx.db.patch(args.tripId, { status: "booked" })
    }

    await ctx.db.insert("bookings", {
      ownerId: identity.subject,
      tripId: args.tripId,
      stopId,
      listingId: "", // email-derived booking — no marketplace listing behind it
      type: args.type,
      amount: args.amount,
      status: "requested",
      paymentMethod: "not-collected",
      reference,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      guests: args.guests,
    })
    return reference
  },
})

export const cancel = mutation({ args: { id: v.id("bookings") }, handler: async (ctx, { id }) => {  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const booking = await ctx.db.get(id)
  if (!booking || booking.ownerId !== identity.subject) throw new Error("Reservation not found")
  // Paid reservations can't be cancelled online — a refund must be issued
  // through the Paystack dashboard.
  if (booking.status === "paid") throw new Error("Paid reservations can't be cancelled online — contact support for a refund")
  // An open checkout blocks cancellation — but an ABANDONED one must not
  // trap the reservation forever. A pending attempt older than the grace
  // window is a closed/crashed popup (a retry would have superseded it, same
  // as payments.initialize does), so void it and let the cancellation through.
  const openPayment = await ctx.db
    .query("payments")
    .withIndex("by_booking", q => q.eq("bookingId", id))
    .filter(q => q.eq(q.field("status"), "pending"))
    .first()
  if (openPayment && Date.now() - openPayment.createdAt < PENDING_PAYMENT_GRACE_MS) {
    throw new Error("Complete or close the pending payment before cancelling")
  }
  if (openPayment) await ctx.db.delete(openPayment._id)
  // Undo the linked itinerary stop and its contribution to the trip total.
  // Note: replaceStops recreates stops with new ids, so match by the booking
  // reference (the `reason` survives itinerary saves) as a fallback.
  if (booking.tripId) {
    const linked = booking.stopId ? await ctx.db.get(booking.stopId) : null
    const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", booking.tripId!)).collect()
    const stop = linked ?? stops.find(s => s.reason === `Reservation ${booking.reference}`)
    if (stop) {
      await ctx.db.delete(stop._id)
      const trip = await ctx.db.get(booking.tripId)
      if (trip) await ctx.db.patch(booking.tripId, { totalCost: Math.max(trip.totalCost - booking.amount, 0) })
    }
    // If this was the last active reservation, the trip drops back to planning.
    const active = await ctx.db.query("bookings").withIndex("by_trip", q => q.eq("tripId", booking.tripId!)).collect()
    if (!active.some(b => b._id !== booking._id && b.status !== "cancelled")) {
      const trip = await ctx.db.get(booking.tripId)
      if (trip && trip.status === "booked") await ctx.db.patch(booking.tripId, { status: "planning" })
    }
  }
  return ctx.db.patch(id, { status: "cancelled" })
}})
