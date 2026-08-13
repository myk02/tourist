import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { requireActiveAccess } from "./subscriptions"

async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  return identity.subject
}

type Access = "owner" | "editor" | "viewer" | null

/**
 * Resolves the current user's level of access to a trip:
 * "owner" (created it), "editor"/"viewer" (invited collaborator), or null.
 */
async function accessRole(ctx: QueryCtx | MutationCtx, tripId: Id<"trips">, subject: string): Promise<Access> {
  const trip = await ctx.db.get(tripId)
  if (!trip) return null
  if (trip.ownerId === subject) return "owner"
  const share = await ctx.db
    .query("tripShares")
    .withIndex("by_trip", q => q.eq("tripId", tripId))
    .filter(q => q.eq(q.field("collaboratorId"), subject))
    .first()
  if (!share) return null
  return share.role === "editor" ? "editor" : "viewer"
}

export const list = query({ args: {}, handler: async (ctx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const owned = await ctx.db.query("trips").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).order("desc").collect()
  const ownedWithRole = owned.map(t => ({ ...t, role: "owner" as const }))
  // Trips shared with me — real-time via Convex subscriptions, so a companion's
  // edit propagates to every collaborator's list and trip page instantly.
  const shares = await ctx.db.query("tripShares").withIndex("by_user", q => q.eq("collaboratorId", identity.subject)).collect()
  const shared = await Promise.all(shares.map(async share => {
    const trip = await ctx.db.get(share.tripId)
    return trip ? { ...trip, role: share.role as "editor" | "viewer" } : null
  }))
  return [...ownedWithRole, ...shared.filter((t): t is NonNullable<typeof t> => t !== null)]
}})

export const get = query({ args: { id: v.id("trips") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const role = await accessRole(ctx, id, identity.subject)
  if (!role) return null
  const trip = await ctx.db.get(id)
  return trip ? { ...trip, role } : null
}})

export const getWithStops = query({ args: { id: v.id("trips") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const role = await accessRole(ctx, id, identity.subject)
  if (!role) return null
  const trip = await ctx.db.get(id)
  if (!trip) return null
  const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  return { ...trip, stops: stops.sort((a, b) => a.order - b.order), role }
}})

const stop = v.object({ name: v.string(), place: v.string(), day: v.number(), time: v.string(), cost: v.number(), kind: v.string(), order: v.number(), lat: v.optional(v.number()), lng: v.optional(v.number()), locked: v.optional(v.boolean()), reason: v.optional(v.string()), verified: v.optional(v.boolean()), duration: v.optional(v.number()) })

export const create = mutation({ args: { name: v.string(), destination: v.string(), origin: v.optional(v.string()), traveler: v.optional(v.string()), startDate: v.string(), endDate: v.string(), budget: v.number(), totalCost: v.number(), stops: v.optional(v.array(stop)) }, handler: async (ctx, args) => {
  const ownerId = await owner(ctx)
  await requireActiveAccess(ctx.db, ownerId)
  const { stops = [], ...trip } = args
  const tripId = await ctx.db.insert("trips", { ...trip, ownerId, status: "planning", coverImage: "/kenya-hero.png" })
  await Promise.all(stops.map(item => ctx.db.insert("tripStops", { ...item, tripId })))
  return tripId
}})

export const replaceStops = mutation({ args: { tripId: v.id("trips"), stops: v.array(stop) }, handler: async (ctx, { tripId, stops }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role || role === "viewer") throw new Error("Trip not found")
  // Owners need active access to edit; invited collaborators ride on the
  // owner's subscription so sharing stays frictionless.
  if (role === "owner") await requireActiveAccess(ctx.db, identity.subject)
  const previous = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", tripId)).collect()
  await Promise.all(previous.map(item => ctx.db.delete(item._id)))
  await Promise.all(stops.map(item => ctx.db.insert("tripStops", { ...item, tripId })))
  const totalCost = stops.reduce((sum, item) => sum + item.cost, 0)
  await ctx.db.patch(tripId, { totalCost })
}})

export const update = mutation({ args: { id: v.id("trips"), patch: v.object({
  name: v.optional(v.string()),
  destination: v.optional(v.string()),
  origin: v.optional(v.string()),
  traveler: v.optional(v.string()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  budget: v.optional(v.number()),
  status: v.optional(v.string()),
  rating: v.optional(v.number()),
  review: v.optional(v.string()),
  sharedAt: v.optional(v.number()),
  coverImage: v.optional(v.string()),
}) }, handler: async (ctx, { id, patch }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const role = await accessRole(ctx, id, identity.subject)
  if (!role || role === "viewer") throw new Error("Trip not found")
  return ctx.db.patch(id, patch)
}})

export const duplicate = mutation({ args: { id: v.id("trips") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const role = await accessRole(ctx, id, identity.subject)
  if (!role || role === "viewer") throw new Error("Trip not found")
  await requireActiveAccess(ctx.db, identity.subject)
  const trip = await ctx.db.get(id)
  if (!trip) throw new Error("Trip not found")
  const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  const newId = await ctx.db.insert("trips", {
    name: `${trip.name} (copy)`,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budget: trip.budget,
    totalCost: trip.totalCost,
    status: "planning",
    ownerId: identity.subject,
    coverImage: trip.coverImage,
  })
  await Promise.all(stops.map(item => ctx.db.insert("tripStops", { ...item, tripId: newId })))
  return newId
}})

export const remove = mutation({ args: { id: v.id("trips") }, handler: async (ctx, { id }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const trip = await ctx.db.get(id)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  await Promise.all(stops.map(item => ctx.db.delete(item._id)))
  const shares = await ctx.db.query("tripShares").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  await Promise.all(shares.map(share => ctx.db.delete(share._id)))
  await ctx.db.delete(id)
}})

// ─── Trip sharing ───────────────────────────────────────────────────────────

/**
 * Creates (or reuses) the owner's open invite link for a trip. The link token
 * stays valid until the owner revokes it, and any signed-in user who opens it
 * is added as a collaborator with the link's role.
 */
export const createShareLink = mutation({ args: { tripId: v.id("trips"), role: v.string() }, handler: async (ctx, { tripId, role }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  const roleValue = role === "viewer" ? "viewer" : "editor"
  const existing = await ctx.db
    .query("tripShares")
    .withIndex("by_trip", q => q.eq("tripId", tripId))
    .filter(q => q.and(q.eq(q.field("collaboratorId"), undefined), q.neq(q.field("token"), undefined)))
    .first()
  if (existing) {
    if (existing.role !== roleValue) await ctx.db.patch(existing._id, { role: roleValue })
    return { token: existing.token! }
  }
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24)
  await ctx.db.insert("tripShares", { tripId, ownerId: identity.subject, token, role: roleValue, invitedAt: Date.now() })
  return { token }
}})

/** Accepts an invite link: adds the signed-in user as a collaborator (idempotent). */
export const acceptInvite = mutation({ args: { token: v.string() }, handler: async (ctx, { token }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const invite = await ctx.db.query("tripShares").withIndex("by_token", q => q.eq("token", token)).unique()
  if (!invite) throw new Error("This invite link is no longer valid")
  if (invite.ownerId === identity.subject) return { status: "owner", role: "owner" }
  const existing = await ctx.db
    .query("tripShares")
    .withIndex("by_trip", q => q.eq("tripId", invite.tripId))
    .filter(q => q.eq(q.field("collaboratorId"), identity.subject))
    .first()
  if (existing) return { status: "already", role: existing.role }
  await ctx.db.insert("tripShares", {
    tripId: invite.tripId,
    ownerId: invite.ownerId,
    collaboratorId: identity.subject,
    role: invite.role,
    invitedAt: Date.now(),
  })
  return { status: "joined", role: invite.role }
}})

/**
 * Lists the trip's collaborators (with names) plus the active invite link, so
 * the share dialog can show who has access. Owner and editors can view it.
 */
export const listShares = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return { collaborators: [], link: null }
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role || role === "viewer") return { collaborators: [], link: null }
  const rows = await ctx.db.query("tripShares").withIndex("by_trip", q => q.eq("tripId", tripId)).collect()
  const collaborators: { shareId: Id<"tripShares">; name: string; image?: string; role: string }[] = []
  let link: { shareId: Id<"tripShares">; token: string; role: string } | null = null
  for (const row of rows) {
    const collaboratorId = row.collaboratorId
    if (collaboratorId) {
      const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", collaboratorId)).unique()
      collaborators.push({ shareId: row._id, name: user?.name ?? "Traveller", image: user?.image, role: row.role })
    } else if (row.token) {
      link = { shareId: row._id, token: row.token, role: row.role }
    }
  }
  return { collaborators, link }
}})

/** Owner only: change a collaborator's role (or the invite link's role). */
export const updateShare = mutation({ args: { shareId: v.id("tripShares"), role: v.string() }, handler: async (ctx, { shareId, role }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const share = await ctx.db.get(shareId)
  if (!share) throw new Error("Share not found")
  const trip = await ctx.db.get(share.tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  return ctx.db.patch(shareId, { role: role === "viewer" ? "viewer" : "editor" })
}})

/** Owner only: remove a collaborator (or revoke the invite link). */
export const removeShare = mutation({ args: { shareId: v.id("tripShares") }, handler: async (ctx, { shareId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const share = await ctx.db.get(shareId)
  if (!share) throw new Error("Share not found")
  const trip = await ctx.db.get(share.tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  await ctx.db.delete(shareId)
}})

/** Collaborator only: leave a shared trip. */
export const leaveTrip = mutation({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const share = await ctx.db
    .query("tripShares")
    .withIndex("by_trip", q => q.eq("tripId", tripId))
    .filter(q => q.eq(q.field("collaboratorId"), identity.subject))
    .first()
  if (!share) throw new Error("You are not a collaborator on this trip")
  await ctx.db.delete(share._id)
}})
