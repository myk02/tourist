import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { accessRole } from "./trips"

/**
 * Calendar sync (TripIt-style): the owner can mint a secret calendar token and
 * subscribe to /api/calendar/<token>.ics in Google/Apple/Outlook Calendar. The
 * token is the feed's password — rotating it kills every old subscriber URL
 * without touching the trip. Disabling clears it so stale links stop working.
 */

function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24)
}

/**
 * Feed resolver used by /api/calendar — looks a token up directly, no auth
 * (the token IS the credential), returning only the public-safe trip fields
 * the feed needs. Null when the token is unknown or the trip never had one.
 */
export const byCalendarToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const trip = await ctx.db
      .query("trips")
      .withIndex("by_calendar_token", q => q.eq("calendarToken", token))
      .unique()
    if (!trip || trip.calendarToken !== token) return null
    return {
      _id: trip._id,
      name: trip.name,
      destination: trip.destination,
      origin: trip.origin,
      startDate: trip.startDate,
      endDate: trip.endDate,
      ownerId: trip.ownerId,
    }
  },
})

/** Every stop of a trip, itinerary order — read by the feed endpoint. */
export const listStops = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", tripId)).collect()
    return stops.sort((a, b) => a.day - b.day || a.order - b.order)
  },
})

/** Owner or editor: returns the trip's calendar token, creating one on demand. */
export const enableCalendarSync = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    const trip = await ctx.db.get(tripId)
    if (!trip) throw new Error("Trip not found")
    const role = await accessRole(ctx, tripId, identity.subject)
    if (!role || role === "viewer") throw new Error("Trip not found")
    if (trip.calendarToken) return { token: trip.calendarToken }
    const token = makeToken()
    await ctx.db.patch(tripId, { calendarToken: token })
    return { token }
  },
})

/** Owner or editor: rotates the token — every previously shared feed URL dies. */
export const rotateCalendarToken = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    const trip = await ctx.db.get(tripId)
    if (!trip) throw new Error("Trip not found")
    const role = await accessRole(ctx, tripId, identity.subject)
    if (!role || role === "viewer") throw new Error("Trip not found")
    const token = makeToken()
    await ctx.db.patch(tripId, { calendarToken: token })
    return { token }
  },
})

/** Owner or editor: disables the feed — subscribed URLs immediately 404. */
export const disableCalendarSync = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    const trip = await ctx.db.get(tripId)
    if (!trip) throw new Error("Trip not found")
    const role = await accessRole(ctx, tripId, identity.subject)
    if (!role || role === "viewer") throw new Error("Trip not found")
    await ctx.db.patch(tripId, { calendarToken: undefined })
    return { disabled: true }
  },
})
