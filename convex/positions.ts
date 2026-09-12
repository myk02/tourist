import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireActiveAccess } from "./subscriptions"
import { accessRole } from "./trips"

export const record = mutation({ args: { tripId: v.id("trips"), lat: v.number(), lng: v.number(), accuracy: v.number() }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  await requireActiveAccess(ctx.db, identity.subject)
  if (!Number.isFinite(args.lat) || args.lat < -90 || args.lat > 90) throw new Error("Invalid latitude")
  if (!Number.isFinite(args.lng) || args.lng < -180 || args.lng > 180) throw new Error("Invalid longitude")
  if (!Number.isFinite(args.accuracy) || args.accuracy < 0 || args.accuracy > 100000) throw new Error("Invalid accuracy")
  const trip = await ctx.db.get(args.tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  // Consent is the actual enforcement point: no consent, no persistence.
  // The provider may fire record() from any entry path (track page or guided
  // journey) — only write when the user has explicitly opted in.
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  if (!user || user.trackingConsent !== true) throw new Error("Tracking consent required — enable it in profile")
  // Throttle: at most 1 point per 5s to prevent table bloat. Over-frequency
  // fixes (1Hz GPS, two tabs) COALESCE — they return unrecorded instead of
  // throwing, so the client never toasts an error for a healthy stream.
  const recent = await ctx.db.query("positions").withIndex("by_trip_time", q => q.eq("tripId", args.tripId)).order("desc").first()
  if (recent && Date.now() - recent.recordedAt < 5000) {
    return { recorded: false as const, throttled: true as const }
  }
  const id = await ctx.db.insert("positions", { ...args, ownerId: identity.subject, recordedAt: Date.now() })
  return { recorded: true as const, id }
}})

// Reads are open to every collaborator role (owner/editor/viewer) — invited
// companions watch the owner's live trace from the track page. Writes stay
// owner-only.
export const forTrip = query({ args: { tripId: v.id("trips"), maxPoints: v.optional(v.number()) }, handler: async (ctx, { tripId, maxPoints }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role) return []
  // Bounded read: the newest points win, capped so a weeks-long trace can't
  // grow the payload without limit. Returned chronologically for drawing.
  const cap = Math.min(Math.max(maxPoints ?? 2000, 100), 5000)
  const rows = await ctx.db.query("positions").withIndex("by_trip_time", q => q.eq("tripId", tripId)).order("desc").take(cap)
  return rows.reverse()
}})

export const latest = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role) return null
  return ctx.db.query("positions").withIndex("by_trip_time", q => q.eq("tripId", tripId)).order("desc").first()
}})
