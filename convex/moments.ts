import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) return []
  const moments = await ctx.db.query("moments").withIndex("by_trip", q => q.eq("tripId", tripId)).order("desc").collect()
  return Promise.all(moments.map(async moment => ({ ...moment, imageUrl: moment.storageId ? await ctx.storage.getUrl(moment.storageId) : null })))
}})

export const generateUploadUrl = mutation({ args: {}, handler: async ctx => {
  if (!await ctx.auth.getUserIdentity()) throw new Error("Sign in required")
  return ctx.storage.generateUploadUrl()
}})

export const create = mutation({ args: { tripId: v.id("trips"), caption: v.string(), storageId: v.optional(v.id("_storage")), stopName: v.optional(v.string()), public: v.boolean() }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const trip = await ctx.db.get(args.tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  return ctx.db.insert("moments", { ...args, ownerId: identity.subject, createdAt: Date.now() })
}})

export const remove = mutation({ args: { id: v.id("moments") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const moment = await ctx.db.get(id)
  if (!moment || moment.ownerId !== identity.subject) throw new Error("Moment not found")
  if (moment.storageId) await ctx.storage.delete(moment.storageId)
  await ctx.db.delete(id)
}})
