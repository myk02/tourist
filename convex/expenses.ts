import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { accessRole } from "./trips"
import { requireActiveAccess } from "./subscriptions"

/**
 * Trip expense log + group split — the Wanderlog/Splitwise surface KenyaTrace
 * lacked. Travellers log real spend during the trip (optionally noting who
 * paid); the UI compares planned vs actual per category and splits the total
 * across the trip's traveller count. One row per expense; deletions are
 * owner-or-author only so a shared trip's books stay trustworthy.
 */

const KINDS = ['Stay', 'Transport', 'Experience', 'Food', 'Other'] as const

export const list = query({
  args: { tripId: v.id('trips') },
  handler: async (ctx, { tripId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const role = await accessRole(ctx, tripId, identity.subject)
    if (!role) return []
    const rows = await ctx.db.query('expenses').withIndex('by_trip', q => q.eq('tripId', tripId)).collect()
    return rows.sort((a, b) => b.spentAt - a.spentAt)
  },
})

export const add = mutation({
  args: { tripId: v.id('trips'), label: v.string(), amount: v.number(), kind: v.string(), spentBy: v.optional(v.string()) },
  handler: async (ctx, { tripId, label, amount, kind, spentBy }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Sign in required')
    const trip = await ctx.db.get(tripId)
    if (!trip) throw new Error('Trip not found')
    const role = await accessRole(ctx, tripId, identity.subject)
    if (!role || role === 'viewer') throw new Error('Trip not found')
    await requireActiveAccess(ctx.db, trip.ownerId)
    const text = label.trim().slice(0, 120)
    if (!text) throw new Error('What was it for?')
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) throw new Error('Enter a realistic amount')
    const id = await ctx.db.insert('expenses', {
      tripId,
      ownerId: identity.subject,
      label: text,
      amount: Math.round(amount * 100) / 100,
      kind: (KINDS as readonly string[]).includes(kind) ? kind : 'Other',
      spentBy: spentBy?.trim().slice(0, 80) || undefined,
      spentAt: Date.now(),
    })
    return id
  },
})

/** Owner or the expense's author can remove it. */
export const remove = mutation({
  args: { id: v.id('expenses') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Sign in required')
    const expense = await ctx.db.get(id)
    if (!expense) return
    const trip = await ctx.db.get(expense.tripId)
    if (!trip) throw new Error('Trip not found')
    const role = await accessRole(ctx, expense.tripId, identity.subject)
    if (!(expense.ownerId === identity.subject || role === 'owner')) throw new Error('Not allowed')
    await ctx.db.delete(id)
  },
})
