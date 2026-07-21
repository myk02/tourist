import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  return identity.subject
}

export const list = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  return ctx.db.query("trips").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).order("desc").collect()
}})

export const get = query({ args: { id: v.id("trips") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const trip = await ctx.db.get(id)
  return trip?.ownerId === identity.subject ? trip : null
}})

export const getWithStops = query({ args: { id: v.id("trips") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const trip = await ctx.db.get(id)
  if (!trip || trip.ownerId !== identity.subject) return null
  const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  return { ...trip, stops: stops.sort((a, b) => a.order - b.order) }
}})

const stop = v.object({ name: v.string(), place: v.string(), day: v.number(), time: v.string(), cost: v.number(), kind: v.string(), order: v.number(), lat: v.optional(v.number()), lng: v.optional(v.number()) })

export const create = mutation({ args: { name: v.string(), destination: v.string(), startDate: v.string(), endDate: v.string(), budget: v.number(), totalCost: v.number(), stops: v.optional(v.array(stop)) }, handler: async (ctx, args) => {
  const ownerId = await owner(ctx)
  const { stops = [], ...trip } = args
  const tripId = await ctx.db.insert("trips", { ...trip, ownerId, status: "planning", coverImage: "/kenya-hero.png" })
  await Promise.all(stops.map(item => ctx.db.insert("tripStops", { ...item, tripId })))
  return tripId
}})

export const replaceStops = mutation({ args: { tripId: v.id("trips"), stops: v.array(stop) }, handler: async (ctx, { tripId, stops }) => {
  const ownerId = await owner(ctx)
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== ownerId) throw new Error("Trip not found")
  const previous = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", tripId)).collect()
  await Promise.all(previous.map(item => ctx.db.delete(item._id)))
  await Promise.all(stops.map(item => ctx.db.insert("tripStops", { ...item, tripId })))
  const totalCost = stops.reduce((sum, item) => sum + item.cost, 0)
  await ctx.db.patch(tripId, { totalCost })
}})

export const remove = mutation({ args: { id: v.id("trips") }, handler: async (ctx, { id }) => {
  const ownerId = await owner(ctx)
  const trip = await ctx.db.get(id)
  if (!trip || trip.ownerId !== ownerId) throw new Error("Trip not found")
  const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  await Promise.all(stops.map(item => ctx.db.delete(item._id)))
  await ctx.db.delete(id)
}})
