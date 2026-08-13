import { mutation, query, type DatabaseWriter } from "./_generated/server"
import { v } from "convex/values"
import { TRIAL_DAYS, DAY_MS } from "../lib/plans"
import type { Doc, Id } from "./_generated/dataModel"

export const me = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
}})

/**
 * The 30-day free trial is anchored at sign-up: the moment the user row is
 * first created, a `subscriptions` row is created too with `trialEndsAt` set
 * to sign-up + 30 days. From then on the countdown is purely server-side
 * (now vs trialEndsAt), so it keeps counting even if the user never signs in
 * again. Idempotent — patching an existing user never restarts the trial.
 */
async function createUserWithTrial(db: DatabaseWriter, args: Omit<Doc<"users">, "_id" | "_creationTime">, now: number): Promise<Id<"users">> {
  const userId = await db.insert("users", { ...args, createdAt: now, updatedAt: now })
  await db.insert("subscriptions", {
    ownerId: args.clerkId,
    trialEndsAt: now + TRIAL_DAYS * DAY_MS,
    createdAt: now,
    updatedAt: now,
  })
  return userId
}

export const sync = mutation({ args: { name: v.string(), email: v.optional(v.string()), image: v.optional(v.string()) }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const existing = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  const now = Date.now()
  if (existing) return ctx.db.patch(existing._id, { ...args, updatedAt: now })
  return createUserWithTrial(ctx.db, { ...args, clerkId: identity.subject }, now)
}})

export const setPreferences = mutation({ args: { preferences: v.object({ styles: v.array(v.string()), interests: v.array(v.string()), destinations: v.array(v.string()), pace: v.optional(v.string()), budget: v.optional(v.number()) }) }, handler: async (ctx, { preferences }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  const now = Date.now()
  if (!user) {
    return createUserWithTrial(ctx.db, { clerkId: identity.subject, name: "Traveller", preferences }, now)
  }
  return ctx.db.patch(user._id, { preferences, updatedAt: now })
}})

export const setTrackingConsent = mutation({ args: { consent: v.boolean() }, handler: async (ctx, { consent }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  const now = Date.now()
  if (!user) {
    return createUserWithTrial(ctx.db, { clerkId: identity.subject, name: "Traveller", trackingConsent: consent }, now)
  }
  return ctx.db.patch(user._id, { trackingConsent: consent, updatedAt: now })
}})
