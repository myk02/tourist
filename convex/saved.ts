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
    // Remember the price at save time so future price drops (from refreshed
    // scrapes) can be flagged back to the traveller.
    const listing = await ctx.db.get(listingId)
    await ctx.db.insert("savedListings", { ownerId: identity.subject, listingId, savedAt: Date.now(), priceAtSave: listing?.price ?? undefined })
  }
}})

/** The traveller's saved row for one listing (price at save time), or null. */
export const find = query({ args: { listingId: v.id("listings") }, handler: async (ctx, { listingId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return ctx.db.query("savedListings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).filter(q => q.eq(q.field("listingId"), listingId)).first()
}})

/**
 * Saved listings whose current price is below what the traveller saved them
 * at, most-dropped first — powers the "price dropped" alerts.
 */
export const drops = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const saved = await ctx.db.query("savedListings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).collect()
  const out: { listing: NonNullable<Awaited<ReturnType<typeof ctx.db.get>>>; savedAt: number; priceAtSave: number; dropPct: number }[] = []
  for (const s of saved) {
    if (s.priceAtSave == null || s.priceAtSave <= 0) continue
    const listing = await ctx.db.get(s.listingId)
    if (listing && listing.price > 0 && listing.price < s.priceAtSave) {
      out.push({ listing, savedAt: s.savedAt, priceAtSave: s.priceAtSave, dropPct: Math.round((1 - listing.price / s.priceAtSave) * 100) })
    }
  }
  return out.sort((a, b) => b.dropPct - a.dropPct)
}})

export const remove = mutation({ args: { listingId: v.id("listings") }, handler: async (ctx, { listingId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const existing = await ctx.db.query("savedListings").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).filter(q => q.eq(q.field("listingId"), listingId)).first()
  if (existing) await ctx.db.delete(existing._id)
}})
