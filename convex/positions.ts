import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireActiveAccess } from "./subscriptions"

export const record = mutation({ args: { tripId: v.id("trips"), lat: v.number(), lng: v.number(), accuracy: v.number() }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  await requireActiveAccess(ctx.db, identity.subject)
  const trip = await ctx.db.get(args.tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  // Consent is the actual enforcement point: no consent, no persistence.
  // The provider may fire record() from any entry path (track page or guided
  // journey) — only write when the user has explicitly opted in.
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  if (!user || user.trackingConsent !== true) return null
  return ctx.db.insert("positions", { ...args, ownerId: identity.subject, recordedAt: Date.now() })
}})

export const forTrip = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) return []
  return ctx.db.query("positions").withIndex("by_trip_time", q => q.eq("tripId", tripId)).order("asc").collect()
}})

export const latest = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) return null
  return ctx.db.query("positions").withIndex("by_trip_time", q => q.eq("tripId", tripId)).order("desc").first()
}})
