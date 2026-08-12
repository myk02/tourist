import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const me = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
}})

export const sync = mutation({ args: { name: v.string(), email: v.optional(v.string()), image: v.optional(v.string()) }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const existing = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  const now = Date.now()
  if (existing) return ctx.db.patch(existing._id, { ...args, updatedAt: now })
  return ctx.db.insert("users", { ...args, clerkId: identity.subject, createdAt: now, updatedAt: now })
}})

export const setPreferences = mutation({ args: { preferences: v.object({ styles: v.array(v.string()), interests: v.array(v.string()), destinations: v.array(v.string()), pace: v.optional(v.string()), budget: v.optional(v.number()) }) }, handler: async (ctx, { preferences }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  const now = Date.now()
  if (!user) {
    return ctx.db.insert("users", { clerkId: identity.subject, name: "Traveller", preferences, createdAt: now, updatedAt: now })
  }
  return ctx.db.patch(user._id, { preferences, updatedAt: now })
}})

export const setTrackingConsent = mutation({ args: { consent: v.boolean() }, handler: async (ctx, { consent }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  const now = Date.now()
  if (!user) {
    return ctx.db.insert("users", { clerkId: identity.subject, name: "Traveller", trackingConsent: consent, createdAt: now, updatedAt: now })
  }
  return ctx.db.patch(user._id, { trackingConsent: consent, updatedAt: now })
}})
