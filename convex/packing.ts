import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { accessRole } from "./trips"
import { requireActiveAccess } from "./subscriptions"

/**
 * Per-trip packing checklist — the Wanderlog-standard feature. Every item is
 * one row so collaborators can pack independently; default Kenya templates
 * (safari / coast / city) are seeded client-side through `addMany`.
 */

const CATEGORIES = ['Essentials', 'Clothing', 'Safari', 'Beach', 'Health', 'Documents', 'Other'] as const

export const list = query({
  args: { tripId: v.id('trips') },
  handler: async (ctx, { tripId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const role = await accessRole(ctx, tripId, identity.subject)
    if (!role) return []
    const items = await ctx.db.query('packingItems').withIndex('by_trip', q => q.eq('tripId', tripId)).collect()
    const order = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]))
    return items.sort((a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.createdAt - b.createdAt,
    )
  },
})

/** Seeds a set of items at once (used by the default-template buttons). */
export const addMany = mutation({
  args: {
    tripId: v.id('trips'),
    items: v.array(v.object({ label: v.string(), category: v.string() })),
  },
  handler: async (ctx, { tripId, items }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Sign in required')
    const trip = await ctx.db.get(tripId)
    if (!trip) throw new Error('Trip not found')
    const role = await accessRole(ctx, tripId, identity.subject)
    if (!role || role === 'viewer') throw new Error('Trip not found')
    await requireActiveAccess(ctx.db, trip.ownerId)
    const existing = await ctx.db.query('packingItems').withIndex('by_trip', q => q.eq('tripId', tripId)).collect()
    const known = new Set(existing.map(i => i.label.toLowerCase()))
    const now = Date.now()
    let added = 0
    for (const item of items.slice(0, 60)) {
      const label = item.label.trim().slice(0, 80)
      if (!label || known.has(label.toLowerCase())) continue
      known.add(label.toLowerCase())
      await ctx.db.insert('packingItems', {
        tripId,
        label,
        category: (CATEGORIES as readonly string[]).includes(item.category) ? item.category : 'Other',
        packed: false,
        createdAt: now,
      })
      added++
    }
    return { added }
  },
})

export const add = mutation({
  args: { tripId: v.id('trips'), label: v.string(), category: v.string() },
  handler: async (ctx, { tripId, label, category }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Sign in required')
    const trip = await ctx.db.get(tripId)
    if (!trip) throw new Error('Trip not found')
    const role = await accessRole(ctx, tripId, identity.subject)
    if (!role || role === 'viewer') throw new Error('Trip not found')
    await requireActiveAccess(ctx.db, trip.ownerId)
    const text = label.trim().slice(0, 80)
    if (!text) throw new Error('Item label is empty')
    const id = await ctx.db.insert('packingItems', {
      tripId,
      label: text,
      category: (CATEGORIES as readonly string[]).includes(category) ? category : 'Other',
      packed: false,
      createdAt: Date.now(),
    })
    return id
  },
})

/** Toggles packed state — every collaborator can pack their own copy of the list. */
export const setPacked = mutation({
  args: { id: v.id('packingItems'), packed: v.boolean() },
  handler: async (ctx, { id, packed }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Sign in required')
    const item = await ctx.db.get(id)
    if (!item) throw new Error('Item not found')
    const role = await accessRole(ctx, item.tripId, identity.subject)
    if (!role || role === 'viewer') throw new Error('Item not found')
    await ctx.db.patch(id, { packed })
  },
})

export const remove = mutation({
  args: { id: v.id('packingItems') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Sign in required')
    const item = await ctx.db.get(id)
    if (!item) throw new Error('Item not found')
    const role = await accessRole(ctx, item.tripId, identity.subject)
    if (!role || role === 'viewer') throw new Error('Item not found')
    await ctx.db.delete(id)
  },
})
