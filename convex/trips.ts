import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { distanceMeters } from "../lib/tracking"
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
export async function accessRole(ctx: QueryCtx | MutationCtx, tripId: Id<"trips">, subject: string): Promise<Access> {
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
  const all = [...ownedWithRole, ...shared.filter((t): t is NonNullable<typeof t> => t !== null)]
  // Real completion stats so cards show actual progress instead of a status
  // guess: how many of the trip's stops have been checked off.
  return Promise.all(all.map(async t => {
    const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", t._id)).collect()
    return { ...t, stopCount: stops.length, doneCount: stops.filter(s => s.completedAt != null).length }
  }))
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

const stop = v.object({ name: v.string(), place: v.string(), day: v.number(), time: v.string(), cost: v.number(), kind: v.string(), order: v.number(), lat: v.optional(v.number()), lng: v.optional(v.number()), locked: v.optional(v.boolean()), reason: v.optional(v.string()), verified: v.optional(v.boolean()), duration: v.optional(v.number()), source: v.optional(v.string()), listingId: v.optional(v.string()), vertical: v.optional(v.string()), unit: v.optional(v.string()),    image: v.optional(v.string()), travelKm: v.optional(v.number()), travelMins: v.optional(v.number()), travelRouted: v.optional(v.boolean()), completedAt: v.optional(v.number()) })

function validateStops(stops: typeof stop.type[]) {
  for (const s of stops) {
    if (!s.name?.trim() || s.name.length > 200) throw new Error("Stop name must be 1-200 characters")
    if (!s.place?.trim() || s.place.length > 120) throw new Error("Stop place must be 1-120 characters")
    if (!(s.kind === "Stay" || s.kind === "Transport" || s.kind === "Experience" || s.kind === "Food")) throw new Error(`Invalid stop kind: ${s.kind}`)
    if (!Number.isInteger(s.day) || s.day < 1 || s.day > 30) throw new Error("Stop day must be 1-30")
    if (!Number.isInteger(s.order) || s.order < 0 || s.order > 1000) throw new Error("Stop order is invalid")
    if (!Number.isFinite(s.cost) || s.cost < 0 || s.cost > 10_000_000) throw new Error("Stop cost is out of range")
    if (s.lat !== undefined && (!Number.isFinite(s.lat) || s.lat < -90 || s.lat > 90)) throw new Error("Invalid stop latitude")
    if (s.lng !== undefined && (!Number.isFinite(s.lng) || s.lng < -180 || s.lng > 180)) throw new Error("Invalid stop longitude")
    if (s.travelKm !== undefined && (!Number.isFinite(s.travelKm) || s.travelKm < 0 || s.travelKm > 20000)) throw new Error("Invalid travel distance")
    if (s.travelMins !== undefined && (!Number.isFinite(s.travelMins) || s.travelMins < 0 || s.travelMins > 100000)) throw new Error("Invalid travel duration")
    if (s.duration !== undefined && (!Number.isFinite(s.duration) || s.duration < 0 || s.duration > 43200)) throw new Error("Invalid stop duration")
  }
}

function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24)
}

function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

export const create = mutation({ args: { name: v.string(), destination: v.string(), origin: v.optional(v.string()), traveler: v.optional(v.string()), startDate: v.string(), endDate: v.string(), budget: v.number(), totalCost: v.number(), travelMonth: v.optional(v.string()), stops: v.optional(v.array(stop)) }, handler: async (ctx, args) => {
  const ownerId = await owner(ctx)
  await requireActiveAccess(ctx.db, ownerId)
  const { stops = [], ...trip } = args
  if (!trip.name.trim() || trip.name.length > 120) throw new Error("Trip name must be 1-120 characters")
  if (!trip.destination.trim() || trip.destination.length > 120) throw new Error("Trip destination must be 1-120 characters")
  if (trip.budget < 0 || trip.budget > 10_000_000 || !Number.isFinite(trip.budget)) throw new Error("Budget is out of range")
  if (!Number.isFinite(trip.totalCost) || trip.totalCost < 0 || trip.totalCost > 10_000_000) throw new Error("Total cost is out of range")
  if (!isValidISODate(trip.startDate) || !isValidISODate(trip.endDate)) throw new Error("Invalid trip dates")
  if (trip.startDate > trip.endDate) throw new Error("Start date must be before end date")
  if (stops.length > 100) throw new Error("Too many stops")
  validateStops(stops)
  const computedTotal = stops.reduce((sum, s) => sum + s.cost, 0)
  if (Math.abs(computedTotal - trip.totalCost) > 1) {
    trip.totalCost = computedTotal
  }
  // Every new trip gets a secret trace-share token so the owner can publish
  // their live trace with a public link at any time (generated up front, only
  // shared when the owner asks).
  const tripId = await ctx.db.insert("trips", { ...trip, ownerId, status: "planning", coverImage: "/kenya-hero.png", traceShareToken: makeToken() })
  await Promise.all(stops.map(item => ctx.db.insert("tripStops", { ...item, tripId })))
  return tripId
}})

export const replaceStops = mutation({ args: { tripId: v.id("trips"), stops: v.array(stop) }, handler: async (ctx, { tripId, stops }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role || role === "viewer") throw new Error("Trip not found")
  const trip = await ctx.db.get(tripId)
  if (!trip) throw new Error("Trip not found")
  await requireActiveAccess(ctx.db, trip.ownerId)
  if (stops.length > 100) throw new Error("Too many stops")
  validateStops(stops)
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
  aiBrief: v.optional(v.string()),
  travelMonth: v.optional(v.string()),
  travelers: v.optional(v.number()),
}) }, handler: async (ctx, { id, patch }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const role = await accessRole(ctx, id, identity.subject)
  if (!role || role === "viewer") throw new Error("Trip not found")
  const trip = await ctx.db.get(id)
  if (!trip) throw new Error("Trip not found")
  await requireActiveAccess(ctx.db, trip.ownerId)
  if (patch.name !== undefined && (!patch.name.trim() || patch.name.length > 120)) throw new Error("Trip name must be 1-120 characters")
  if (patch.destination !== undefined && (!patch.destination.trim() || patch.destination.length > 120)) throw new Error("Trip destination must be 1-120 characters")
  if (patch.budget !== undefined && (!Number.isFinite(patch.budget) || patch.budget < 0 || patch.budget > 10_000_000)) throw new Error("Budget is out of range")
  if (patch.status !== undefined && !["planning", "booked", "travelling", "completed"].includes(patch.status)) throw new Error("Invalid status")
  if (patch.rating !== undefined && (!Number.isFinite(patch.rating) || patch.rating < 0 || patch.rating > 5)) throw new Error("Rating must be 0-5")
  if (patch.travelers !== undefined && (!Number.isInteger(patch.travelers) || patch.travelers < 1 || patch.travelers > 50)) throw new Error("Travelers must be 1-50")
  if (patch.startDate !== undefined && !isValidISODate(patch.startDate)) throw new Error("Invalid startDate")
  if (patch.endDate !== undefined && !isValidISODate(patch.endDate)) throw new Error("Invalid endDate")
  if (patch.coverImage !== undefined && patch.coverImage.length > 2048) throw new Error("Cover image URL too long")
  if (patch.review !== undefined && patch.review.length > 5000) throw new Error("Review too long")
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
    origin: trip.origin,
    traveler: trip.traveler,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budget: trip.budget,
    totalCost: trip.totalCost,
    status: "planning",
    ownerId: identity.subject,
    coverImage: trip.coverImage,
    travelMonth: trip.travelMonth,
    travelers: trip.travelers,
    aiBrief: trip.aiBrief,
    traceShareToken: makeToken(),
  })
  await Promise.all(stops.map(item => {
    const { _id, _creationTime, tripId: _oldTripId, ...rest } = item as typeof item & { _id: Id<"tripStops">; _creationTime: number; tripId: Id<"trips"> }
    return ctx.db.insert("tripStops", { ...rest, tripId: newId })
  }))
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
  // Deleting a trip must not orphan its live-trace points, moments or the
  // files those moments uploaded.
  const positions = await ctx.db.query("positions").withIndex("by_trip_time", q => q.eq("tripId", id)).collect()
  await Promise.all(positions.map(p => ctx.db.delete(p._id)))
  const moments = await ctx.db.query("moments").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  await Promise.all(moments.map(async m => {
    const storageIds = [m.storageId, ...(m.storageIds ?? [])].filter((x): x is Id<"_storage"> => !!x)
    const videoIds = m.videoStorageIds ?? []
    await Promise.all([...storageIds, ...videoIds].map(sid => ctx.storage.delete(sid)))
    await ctx.db.delete(m._id)
  }))
  // Cascade: bookings + payments + votes + notes otherwise orphaned with dangling tripId
  const bookings = await ctx.db.query("bookings").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  for (const b of bookings) {
    const pays = await ctx.db.query("payments").withIndex("by_booking", q => q.eq("bookingId", b._id)).collect()
    await Promise.all(pays.map(p => ctx.db.delete(p._id)))
    await ctx.db.delete(b._id)
  }
  const votes = await ctx.db.query("stopVotes").withIndex("by_trip", q => q.eq("tripId", id)).collect()
  await Promise.all(votes.map(v => ctx.db.delete(v._id)))
  const notes = await ctx.db.query("dayNotes").withIndex("by_trip_day", q => q.eq("tripId", id)).collect()
  await Promise.all(notes.map(n => ctx.db.delete(n._id)))
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
  const rows = await ctx.db
    .query("tripShares")
    .withIndex("by_trip", q => q.eq("tripId", tripId))
    .collect()
  const existing = rows.find(r => r.collaboratorId === undefined && r.token !== undefined)
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

// ─── Live-trace sharing (Phase 3: shareable public trace) ───────────────────

/**
 * Owner only: returns the trip's trace-share token, creating it on demand for
 * trips created before tokens existed. The token is the "password" for the
 * public trace link — the owner shares it explicitly, never automatically.
 */
export const enableTraceShare = mutation({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  if (trip.traceShareToken) return { token: trip.traceShareToken }
  const token = makeToken()
  await ctx.db.patch(tripId, { traceShareToken: token })
  return { token }
}})

/**
 * Owner only: revokes the public trace/recap/moments link. Clears the token
 * so every previously shared `?t=` URL immediately stops working.
 */
export const disableTraceShare = mutation({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  await ctx.db.patch(tripId, { traceShareToken: undefined })
  return { disabled: true }
}})

/**
 * Owner only: rotates the public link token. The old `?t=` URL stops working
 * and a fresh one is issued — use after a leak instead of disabling sharing.
 */
export const rotateTraceShare = mutation({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const trip = await ctx.db.get(tripId)
  if (!trip || trip.ownerId !== identity.subject) throw new Error("Trip not found")
  const token = makeToken()
  await ctx.db.patch(tripId, { traceShareToken: token })
  return { token }
}})

/**
 * Owner and editors can check a stop off as done (and un-check it). Setting
 * completedAt stamps the moment; un-checking clears it.
 */
export const setStopCompleted = mutation({ args: { tripId: v.id("trips"), stopId: v.id("tripStops"), completed: v.boolean() }, handler: async (ctx, { tripId, stopId, completed }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role || role === "viewer") throw new Error("Trip not found")
  const trip = await ctx.db.get(tripId)
  if (!trip) throw new Error("Trip not found")
  await requireActiveAccess(ctx.db, trip.ownerId)
  const stopRow = await ctx.db.get(stopId)
  if (!stopRow || stopRow.tripId !== tripId) throw new Error("Stop not found")
  return ctx.db.patch(stopId, { completedAt: completed ? Date.now() : undefined })
}})

/**
 * Public, token-gated view of a trip's live trace — powers the shareable
 * trace page. No sign-in required; returns only what a stranger may see
 * (trip name, dates, stop names/places, the recorded path) and never any
 * costs, owner identity, or booking data.
 */
export const publicTrace = query({ args: { tripId: v.id("trips"), token: v.string() }, handler: async (ctx, { tripId, token }) => {
  const trip = await ctx.db.get(tripId)
  if (!trip || !trip.traceShareToken || trip.traceShareToken !== token) return null
  const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", tripId)).collect()
  // Bounded read (newest points win) so long traces can't grow without limit.
  const traceRows = await ctx.db.query("positions").withIndex("by_trip_time", q => q.eq("tripId", tripId)).order("desc").take(5000)
  const trace = traceRows.reverse()
  const lastRecordedAt = trace.length ? trace[trace.length - 1].recordedAt : undefined
  const publicStops = stops
    .sort((a, b) => a.order - b.order)
    .map(s => ({ day: s.day, name: s.name, place: s.place, time: s.time, lat: s.lat, lng: s.lng }))
  // Straight-line distance along the recorded path.
  let distanceKm = 0
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1]
    const b = trace[i]
    if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
      distanceKm += distanceMeters(a.lat, a.lng, b.lat, b.lng) / 1000
    }
  }
  return {
    trip: {
      name: trip.name,
      destination: trip.destination,
      origin: trip.origin ?? undefined,
      startDate: trip.startDate,
      endDate: trip.endDate,
      // The generic cover photo only — used for social embed images. Never
      // costs, owner identity or booking data.
      coverImage: trip.coverImage ?? undefined,
    },
    stops: publicStops,
    trace: trace.map(p => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, recordedAt: p.recordedAt })),
    distanceKm: Math.round(distanceKm),
    lastRecordedAt,
  }
}})

/**
 * Profile travel snapshot: how many itinerary stops the traveller has checked
 * off across all their trips. Trips-taken and moments-captured already exist
 * as client-side queries; this is the one number nothing else returns.
 */
export const checkedStopCount = query({ args: {}, handler: async ctx => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return 0
  const trips = await ctx.db.query("trips").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).collect()
  let checked = 0
  for (const t of trips) {
    const stops = await ctx.db.query("tripStops").withIndex("by_trip", q => q.eq("tripId", t._id)).collect()
    checked += stops.filter(s => s.completedAt != null).length
  }
  return checked
}})

// ─── Group layer: stop votes + per-day notes (no chat — Tripnotes-lite) ──────

/** Cast or clear the current user's thumb on an itinerary stop. Editors and
 *  owners only — viewers get read-only counts. */
export const setStopVote = mutation({ args: { stopId: v.id("tripStops"), vote: v.union(v.literal("up"), v.literal("down"), v.null()) }, handler: async (ctx, { stopId, vote }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const stop = await ctx.db.get(stopId)
  if (!stop) throw new Error("Trip not found")
  const role = await accessRole(ctx, stop.tripId, identity.subject)
  if (!role || role === "viewer") throw new Error("Trip not found")
  const trip = await ctx.db.get(stop.tripId)
  if (!trip) throw new Error("Trip not found")
  await requireActiveAccess(ctx.db, trip.ownerId)
  const existing = await ctx.db.query("stopVotes").withIndex("by_stop_user", q => q.eq("stopId", stopId).eq("userId", identity.subject)).unique()
  if (vote === null) {
    if (existing) await ctx.db.delete(existing._id)
    return
  }
  if (existing) {
    await ctx.db.patch(existing._id, { vote })
    return
  }
  await ctx.db.insert("stopVotes", { stopId, tripId: stop.tripId, userId: identity.subject, vote })
}})

/** Every vote on a trip's stops, for collaborators' UIs to aggregate. */
export const votesForTrip = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role) return []
  const rows = await ctx.db.query("stopVotes").withIndex("by_trip", q => q.eq("tripId", tripId)).collect()
  return rows.map(v => ({ stopId: v.stopId, userId: v.userId, vote: v.vote }))
}})

/** One lightweight comment thread per itinerary day. */
export const dayNotesForTrip = query({ args: { tripId: v.id("trips") }, handler: async (ctx, { tripId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role) return []
  const rows = await ctx.db.query("dayNotes").withIndex("by_trip_day", q => q.eq("tripId", tripId)).collect()
  return rows
    .sort((a, b) => a.day - b.day || a.createdAt - b.createdAt)
    .map(n => ({ _id: n._id, day: n.day, authorId: n.authorId, authorName: n.authorName, body: n.body, createdAt: n.createdAt }))
}})

export const addDayNote = mutation({ args: { tripId: v.id("trips"), day: v.number(), body: v.string() }, handler: async (ctx, { tripId, day, body }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const role = await accessRole(ctx, tripId, identity.subject)
  if (!role || role === "viewer") throw new Error("Trip not found")
  if (day < 1 || day > 30 || !Number.isInteger(day)) throw new Error("Day must be 1-30")
  const trip = await ctx.db.get(tripId)
  if (!trip) throw new Error("Trip not found")
  await requireActiveAccess(ctx.db, trip.ownerId)
  const text = body.trim().slice(0, 500)
  if (!text) throw new Error("Note is empty")
  await ctx.db.insert("dayNotes", {
    tripId,
    day,
    authorId: identity.subject,
    authorName: identity.name ?? "Traveller",
    body: text,
    createdAt: Date.now(),
  })
}})

/** Authors remove their own notes; the owner can moderate any of them. */
export const removeDayNote = mutation({ args: { noteId: v.id("dayNotes") }, handler: async (ctx, { noteId }) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Sign in required")
  const note = await ctx.db.get(noteId)
  if (!note) return
  const trip = await ctx.db.get(note.tripId)
  if (!trip) throw new Error("Trip not found")
  const role = await accessRole(ctx, note.tripId, identity.subject)
  if (!(note.authorId === identity.subject || role === "owner")) throw new Error("Not allowed")
  await requireActiveAccess(ctx.db, trip.ownerId)
  await ctx.db.delete(noteId)
}})
