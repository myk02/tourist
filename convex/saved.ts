import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireActiveAccess } from "./subscriptions"

export const list = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  return ctx.db.query("savedListings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).order("desc").collect()
}})

export const listWithDetails = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const saved = await ctx.db.query("savedListings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).order("desc").collect()
  const listings = await Promise.all(saved.map(s => ctx.db.get(s.listingId)))
  return saved.map((s, i) => ({ ...s, listing: listings[i] })).filter(x => x.listing)
}})

export const save = mutation({ args: { listingId: v.id("listings") }, handler: async (ctx, { listingId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  await requireActiveAccess(ctx.db, identity.subject)
  const existing = await ctx.db.query("savedListings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).filter(q => q.eq(q.field("listingId"), listingId)).first()
  if (!existing) {
    await ctx.db.insert("savedListings", { ownerId: identity.subject, listingId, savedAt: Date.now() })
  }
}})

export const remove = mutation({ args: { listingId: v.id("listings") }, handler: async (ctx, { listingId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const existing = await ctx.db.query("savedListings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).filter(q => q.eq(q.field("listingId"), listingId)).first()
  if (existing) await ctx.db.delete(existing._id)
}})
