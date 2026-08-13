import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { requireActiveAccess } from "./subscriptions"

function idsOf(storageId: Id<'_storage'> | undefined, storageIds: Id<'_storage'>[] | undefined): Id<'_storage'>[] {
  return [storageId, ...(storageIds ?? [])].filter((x): x is Id<'_storage'> => !!x)
}

export const list = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) return []
  const moments = await ctx.db.query("moments").withIndex("by_trip", q => q.eq("tripId", tripId)).order("desc").collect()
  return Promise.all(moments.map(async moment => {
    const ids = idsOf(moment.storageId, moment.storageIds)
    const imageUrls = await Promise.all(ids.map(id => ctx.storage.getUrl(id)))
    const videoUrls = await Promise.all((moment.videoStorageIds ?? []).map(id => ctx.storage.getUrl(id)))
    return { ...moment, imageUrl: imageUrls[0] ?? null, imageUrls: imageUrls.filter((x): x is string => !!x), videoUrls: videoUrls.filter((x): x is string => !!x) }
  }))
}})

export const publicForTrip = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const trip = await ctx.db.get(tripId)
  if (!trip) return null
  const moments = await ctx.db.query("moments").withIndex("by_trip", q => q.eq("tripId", tripId)).order("desc").collect()
  const publicMoments = moments.filter(m => m.public)
  const withUrls = await Promise.all(publicMoments.map(async moment => {
    const ids = idsOf(moment.storageId, moment.storageIds)
    const imageUrls = await Promise.all(ids.map(id => ctx.storage.getUrl(id)))
    const videoUrls = await Promise.all((moment.videoStorageIds ?? []).map(id => ctx.storage.getUrl(id)))
    return { ...moment, imageUrl: imageUrls[0] ?? null, imageUrls: imageUrls.filter((x): x is string => !!x), videoUrls: videoUrls.filter((x): x is string => !!x) }
  }))
  return {
    trip: { name: trip.name, destination: trip.destination, origin: trip.origin, startDate: trip.startDate, endDate: trip.endDate, rating: trip.rating, review: trip.review },
    moments: withUrls,
  }
}})

export const allForOwner = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const trips = await ctx.db.query("trips").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).collect()
  const tripName = new Map(trips.map(t => [t._id, t.name]))
  const byTrip = await Promise.all(trips.map(t => ctx.db.query("moments").withIndex("by_trip", q => q.eq("tripId", t._id)).order("desc").collect()))
  const all = byTrip.flat().sort((a, b) => b.createdAt - a.createdAt)
  return Promise.all(all.map(async moment => ({ ...moment, imageUrl: moment.storageId ? await ctx.storage.getUrl(moment.storageId) : null, tripName: tripName.get(moment.tripId) ?? '' })))
}})

export const generateUploadUrl = mutation({ args: {}, handler: async ctx => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  await requireActiveAccess(ctx.db, identity.subject)
  return ctx.storage.generateUploadUrl()
}})

export const create = mutation({ args: { tripId: v.id("trips"), caption: v.string(), storageId: v.optional(v.id("_storage")), storageIds: v.optional(v.array(v.id("_storage"))), videoStorageIds: v.optional(v.array(v.id("_storage"))), stopName: v.optional(v.string()), location: v.optional(v.string()), lat: v.optional(v.number()), lng: v.optional(v.number()), public: v.boolean() }, handler: async (ctx, args) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  await requireActiveAccess(ctx.db, identity.subject)
  const trip = await ctx.db.get(args.tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  const { storageId, storageIds, videoStorageIds, ...rest } = args
  const ids = idsOf(storageId, storageIds)
  return ctx.db.insert("moments", {
    ...rest,
    ownerId: identity.subject,
    storageId: ids[0],
    storageIds: ids.length > 1 ? ids : undefined,
    videoStorageIds: videoStorageIds && videoStorageIds.length > 0 ? videoStorageIds : undefined,
    best: false,
    createdAt: Date.now(),
  })
}})

export const setBest = mutation({ args: { id: v.id("moments"), best: v.boolean() }, handler: async (ctx, { id, best }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const moment = await ctx.db.get(id)
  if (!moment || moment.ownerId !== identity.subject) throw new Error("Moment not found")
  if (best) {
    const siblings = await ctx.db.query("moments").withIndex("by_trip", q => q.eq("tripId", moment.tripId)).collect()
    await Promise.all(siblings.filter(m => m._id !== id && m.best).map(m => ctx.db.patch(m._id, { best: false })))
  }
  return ctx.db.patch(id, { best })
}})

export const setPublic = mutation({ args: { id: v.id("moments"), public: v.boolean() }, handler: async (ctx, { id, public: pub }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const moment = await ctx.db.get(id)
  if (!moment || moment.ownerId !== identity.subject) throw new Error("Moment not found")
  return ctx.db.patch(id, { public: pub })
}})

export const remove = mutation({ args: { id: v.id("moments") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const moment = await ctx.db.get(id)
  if (!moment || moment.ownerId !== identity.subject) throw new Error("Moment not found")
  const ids = idsOf(moment.storageId, moment.storageIds)
  const videoIds = moment.videoStorageIds ?? []
  await Promise.all([...ids, ...videoIds].map(sid => ctx.storage.delete(sid)))
  await ctx.db.delete(id)
}})
