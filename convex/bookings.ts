import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { dayFromDate, stayNights } from "../lib/dates"
import { requireActiveAccess } from "./subscriptions"
import { accessRole } from "./trips"

function kindFromVertical(vertical: string): string {
  if (vertical === "stays") return "Stay"
  if (vertical === "flights" || vertical === "taxis" || vertical === "cars") return "Transport"
  return "Experience"
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
  if (!trip) return []
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role) return []
  return ctx.db.query("bookings").withIndex("by_trip", q => q.eq("tripId", tripId)).order("desc").collect()
}})

export const create = mutation({ args: { listingId: v.string(), type: v.string(), amount: v.number(), tripId: v.optional(v.id("trips")), checkIn: v.optional(v.string()), checkOut: v.optional(v.string()), guests: v.optional(v.number()) }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  await requireActiveAccess(ctx.db, identity.subject)
  if (!["Stay", "Transport", "Experience", "Food", "Flight"].includes(args.type)) throw new Error("Invalid booking type")
  if (args.guests !== undefined && (!Number.isInteger(args.guests) || args.guests < 1 || args.guests > 20)) throw new Error("Guests must be 1-20")
  if (!Number.isFinite(args.amount) || args.amount < 0 || args.amount > 10_000_000) throw new Error("Invalid amount")
  if (args.checkIn && !/^\d{4}-\d{2}-\d{2}$/.test(args.checkIn)) throw new Error("Invalid checkIn date")
  if (args.checkOut && !/^\d{4}-\d{2}-\d{2}$/.test(args.checkOut)) throw new Error("Invalid checkOut date")
  if (args.checkIn && Number.isNaN(Date.parse(args.checkIn))) throw new Error("Invalid checkIn date")
  if (args.checkOut && Number.isNaN(Date.parse(args.checkOut))) throw new Error("Invalid checkOut date")
  // Amount must match the marketplace listing exactly — a client-supplied
  // amount would let anyone understate what it owes (the pay flow trusts
  // booking.amount when verifying against Paystack).
  const listing = await ctx.db.get(args.listingId as Id<"listings">)
  if (!listing) throw new Error("Listing not found")
  if (args.amount !== listing.price) throw new Error("Reservation price does not match the current listing price")
  if (args.type !== kindFromVertical(listing.vertical) && !(args.type === "Food" && listing.vertical === "taxis")) {
    // Allow but don't enforce strictly — vertical mapping is helper
  }
  const reference = `KT-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`

  // When the reservation is linked to a trip, mirror it as a trip stop so it
  // shows on the itinerary and route map.
  let stopId: Id<"tripStops"> | undefined
  if (args.tripId) {
    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Trip not found")
    const role = await accessRole(ctx, args.tripId, identity.subject)
    if (!role || role === "viewer") throw new Error("Trip not found")
    const existing = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", args.tripId!)).collect()
    const day = args.checkIn ? dayFromDate(trip.startDate, args.checkIn) : (existing.length ? Math.max(...existing.map(s => s.day)) : 1)
    // duration is stored in minutes; a stay is 24h per night booked.
    const kind = kindFromVertical(listing.vertical)
    let duration: number | undefined
    if (kind === "Stay" && args.checkIn && args.checkOut) {
      const days = stayNights(args.checkIn, args.checkOut)
      duration = days * 1440
      if (!Number.isFinite(duration) || duration < 0 || duration > 43200) duration = 1440
    }
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
    const freshTrip = await ctx.db.get(args.tripId)
    if (freshTrip) {
      await ctx.db.patch(args.tripId, { totalCost: freshTrip.totalCost + args.amount })
      if (freshTrip.status === "planning") await ctx.db.patch(args.tripId, { status: "booked" })
    }
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
    if (!["Stay", "Transport", "Experience", "Flight", "Food"].includes(args.type)) throw new Error("Invalid booking type")
    if (args.guests !== undefined && (!Number.isInteger(args.guests) || args.guests < 1 || args.guests > 20)) throw new Error("Guests must be 1-20")
    if (args.checkIn && (!/^\d{4}-\d{2}-\d{2}$/.test(args.checkIn) || Number.isNaN(Date.parse(args.checkIn)))) throw new Error("Invalid checkIn date")
    if (args.checkOut && (!/^\d{4}-\d{2}-\d{2}$/.test(args.checkOut) || Number.isNaN(Date.parse(args.checkOut)))) throw new Error("Invalid checkOut date")
    if (args.name.trim().length < 2 || args.name.length > 200) throw new Error("Invalid booking name")
    if (args.place !== undefined && args.place.length > 120) throw new Error("Place too long")
    // No marketplace listing backs an email-derived booking, so the amount
    // can't be cross-checked — but it must be a plausible positive amount.
    if (!Number.isFinite(args.amount) || !(args.amount > 0) || args.amount > 10_000_000) throw new Error("Invalid reservation amount")
    const reference = args.reference || `KT-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`
    const kind = args.type === "Stay" ? "Stay" : args.type === "Flight" || args.type === "Transport" ? "Transport" : "Experience"

    // Mirror the reservation as a trip stop (like `create`) so it shows on
    // the itinerary and route map, keyed by reference so `cancel` can undo it.
    let stopId: Id<"tripStops"> | undefined
    if (args.tripId) {
      const trip = await ctx.db.get(args.tripId)
      if (!trip) throw new Error("Trip not found")
      const role = await accessRole(ctx, args.tripId, identity.subject)
      if (!role || role === "viewer") throw new Error("Trip not found")
      const existing = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", args.tripId!)).collect()
      const day = args.checkIn ? dayFromDate(trip.startDate, args.checkIn) : (existing.length ? Math.max(...existing.map(s => s.day)) : 1)
      let duration: number | undefined
      if (kind === "Stay" && args.checkIn && args.checkOut) {
        const days = stayNights(args.checkIn, args.checkOut)
        duration = days * 1440
        if (!Number.isFinite(duration) || duration < 0 || duration > 43200) duration = 1440
      }
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
      const freshTrip2 = await ctx.db.get(args.tripId)
      if (freshTrip2) {
        await ctx.db.patch(args.tripId, { totalCost: freshTrip2.totalCost + args.amount })
        if (freshTrip2.status === "planning") await ctx.db.patch(args.tripId, { status: "booked" })
      }
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
  // Webhook race guard: re-fetch booking after payment handling
  const fresh = await ctx.db.get(id)
  if (!fresh) throw new Error("Reservation not found")
  if (fresh.status === "paid") throw new Error("Paid reservations can't be cancelled online — contact support for a refund")
  if (fresh.status === "cancelled") return
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
