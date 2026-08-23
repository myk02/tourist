import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { DAY_MS } from "../lib/plans"
import { accessRole } from "./trips"
import { requireActiveAccess } from "./subscriptions"

// The moments growth loop: every MEDIA_PER_DAY photos/videos a traveller
// uploads earns them one extra free day of access (stacked onto paidUntil
// exactly like a day pack). Documenting the trip keeps access alive.
const MEDIA_PER_DAY = 3

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
    // Reactions are collaborator-internal — never exposed on public pages.
    const { reactions, ...rest } = moment
    return { ...rest, imageUrl: imageUrls[0] ?? null, imageUrls: imageUrls.filter((x): x is string => !!x), videoUrls: videoUrls.filter((x): x is string => !!x) }
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
  return Promise.all(all.map(async moment => {
    // Resolve every image a moment carries (older moments have a single
    // storageId, newer ones a storageIds array) — not just the first.
    const ids = idsOf(moment.storageId, moment.storageIds)
    const urls = await Promise.all(ids.map(id => ctx.storage.getUrl(id)))
    return {
      ...moment,
      imageUrl: urls[0] ?? null,
      imageUrls: urls.filter((x): x is string => !!x),
      tripName: tripName.get(moment.tripId) ?? '',
    }
  }))
}})

/**
 * The traveller's moments reward state: how many media they've uploaded, how
 * many free days that has earned, and how close they are to the next day.
 */
export const credit = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  const total = user?.momentsMediaTotal ?? 0
  const earnedDays = user?.momentsEarnedDays ?? 0
  const seg = total % MEDIA_PER_DAY
  return {
    earnedDays,
    mediaTotal: total,
    // How many more uploads unlock the next free day (0 when nothing yet).
    mediaForNextDay: total === 0 ? MEDIA_PER_DAY : seg === 0 ? MEDIA_PER_DAY : MEDIA_PER_DAY - seg,
  }
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
  const id = await ctx.db.insert("moments", {
    ...rest,
    ownerId: identity.subject,
    storageId: ids[0],
    storageIds: ids.length > 1 ? ids : undefined,
    videoStorageIds: videoStorageIds && videoStorageIds.length > 0 ? videoStorageIds : undefined,
    best: false,
    createdAt: Date.now(),
  })

  // Moments reward: uploading media earns free days of access. The days stack
  // onto paidUntil (like a day pack) so the reward compounds with paid days
  // and is never lost when a trial is still running.
  const mediaCount = Math.max(ids.length + (videoStorageIds?.length ?? 0), 1)
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
  const prior = user?.momentsMediaTotal ?? 0
  const total = prior + mediaCount
  const earnedNow = Math.max(Math.floor(total / MEDIA_PER_DAY) - Math.floor(prior / MEDIA_PER_DAY), 0)
  if (user && earnedNow > 0) {
    const now = Date.now()
    const sub = await ctx.db.query("subscriptions").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).unique()
    if (sub) {
      await ctx.db.patch(sub._id, { paidUntil: Math.max(sub.paidUntil ?? 0, now) + earnedNow * DAY_MS, updatedAt: now })
    }
    await ctx.db.patch(user._id, {
      momentsMediaTotal: total,
      momentsEarnedDays: (user.momentsEarnedDays ?? 0) + earnedNow,
      updatedAt: now,
    })
  } else if (user) {
    await ctx.db.patch(user._id, { momentsMediaTotal: total, updatedAt: Date.now() })
  }
  return { id, earnedDays: earnedNow }
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

const REACTION_EMOJIS = ["👍", "❤️", "🔥", "🎉"] as const

/** Quick-tap reaction on a moment. Collaborators (editors/owners) only —
 *  tapping an existing reaction removes it. Counts stay inside the album. */
export const react = mutation({ args: { id: v.id("moments"), emoji: v.string() }, handler: async (ctx, { id, emoji }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) throw new Error("Unsupported reaction")
  const moment = await ctx.db.get(id)
  if (!moment) throw new Error("Moment not found")
  const role = await accessRole(ctx, moment.tripId, identity.subject)
  if (!role || role === "viewer") throw new Error("Only collaborators can react")
  // Reactions are content writes — expired owners don't get to add them,
  // matching every other write on the trip.
  if (role === "owner") await requireActiveAccess(ctx.db, identity.subject)
  const mine = (moment.reactions ?? []).find(r => r.userId === identity.subject)
  const had = mine?.emoji === emoji
  // One reaction per person: a second tap clears it, a different emoji switches it.
  const reactions = [
    ...(moment.reactions ?? []).filter(r => r.userId !== identity.subject),
    ...(had ? [] : [{ userId: identity.subject, emoji }]),
  ].slice(0, 50)
  await ctx.db.patch(id, { reactions: reactions.length ? reactions : undefined })
  return { reacted: !had }
}})
