import { internalMutation, internalQuery, type DatabaseWriter } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { TRIAL_DAYS } from "../lib/plans"

const DAY_MS = 86400000

/** Extends the user's paid access from max(now, paidUntil) — packs stack. */
async function extendPaidAccess(db: DatabaseWriter, ownerId: string, days: number, now: number) {
  const sub = await db
    .query("subscriptions")
    .withIndex("by_owner", q => q.eq("ownerId", ownerId))
    .unique()
  if (!sub) {
    const user = await db.query("users").withIndex("by_clerk", q => q.eq("clerkId", ownerId)).unique()
    const trialStart = user?.createdAt ?? now
    await db.insert("subscriptions", {
      ownerId,
      trialEndsAt: trialStart + TRIAL_DAYS * DAY_MS,
      paidUntil: now + days * DAY_MS,
      createdAt: now,
      updatedAt: now,
    })
    return
  }
  const base = sub.paidUntil && sub.paidUntil > now ? sub.paidUntil : now
  await db.patch(sub._id, { paidUntil: base + days * DAY_MS, updatedAt: now })
}

/**
 * Internal helpers for `convex/subscriptions.ts`. Kept in a separate module so
 * the actions can reference them through direct imports without creating a
 * type-inference cycle (the same pattern as `payments_helpers.ts`).
 *
 * NOT callable from the client — only from Convex actions and the webhook.
 */

/** Server-side read used by actions — never callable from the client. */
export const getPurchaseForVerify = internalQuery({
  args: { purchaseId: v.id("subscriptionPurchases"), ownerId: v.string() },
  handler: async (ctx, { purchaseId, ownerId }) => {
    const purchase = await ctx.db.get(purchaseId)
    if (!purchase || purchase.ownerId !== ownerId) return null
    return purchase
  },
})

/** Extends the user's paid access by the purchased days (idempotent). */
export const applyDayPack = internalMutation({
  args: { purchaseId: v.id("subscriptionPurchases") },
  handler: async (ctx, { purchaseId }) => {
    const purchase = await ctx.db.get(purchaseId)
    if (!purchase || purchase.status === "paid") return
    const now = Date.now()
    await ctx.db.patch(purchase._id, { status: "paid", paidAt: now })
    await extendPaidAccess(ctx.db, purchase.ownerId, purchase.days, now)
  },
})

/**
 * Webhook path — applies the day pack for a `charge.success`. Day-pack
 * references are never regenerated (each purchase is a fresh row), so the
 * exact reference match always succeeds — no email/amount fallback is needed
 * here (the webhook routes KT-SUB- references to this handler only).
 */
export const applyDayPackByCharge = internalMutation({
  args: { reference: v.string(), email: v.string(), amount: v.number(), currency: v.string() },
  handler: async (ctx, { reference, amount, currency }) => {
    const purchase = await ctx.db
      .query("subscriptionPurchases")
      .withIndex("by_reference", q => q.eq("reference", reference))
      .first()
    if (!purchase || purchase.status === "paid") return { applied: false }
    // Webhook amount is in minor units — validate before crediting.
    if (amount !== purchase.amount * 100 || currency !== purchase.currency) return { applied: false }
    const now = Date.now()
    await ctx.db.patch(purchase._id, { status: "paid", paidAt: now })
    await extendPaidAccess(ctx.db, purchase.ownerId, purchase.days, now)
    return { applied: true }
  },
})

export type { Id }
