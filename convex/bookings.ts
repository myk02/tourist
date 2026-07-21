import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const mine = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  return ctx.db.query("bookings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).order("desc").collect()
}})

export const create = mutation({ args: { listingId: v.string(), type: v.string(), amount: v.number(), tripId: v.optional(v.id("trips")) }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  if (args.amount < 0) throw new Error("Invalid reservation amount")
  const reference = `KT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  await ctx.db.insert("bookings", { ...args, ownerId: identity.subject, status: "requested", paymentMethod: "not-collected", reference })
  return reference
}})

export const cancel = mutation({ args: { id: v.id("bookings") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const booking = await ctx.db.get(id)
  if (!booking || booking.ownerId !== identity.subject) throw new Error("Reservation not found")
  return ctx.db.patch(id, { status: "cancelled" })
}})
